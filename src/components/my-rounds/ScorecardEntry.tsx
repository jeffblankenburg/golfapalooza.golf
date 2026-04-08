"use client";

import { useState } from "react";
import { getScoreColorClass, calculateDifferential } from "@/lib/golf/calculator";

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

interface Player {
  id: string;
  name: string;
}

interface ScorecardEntryProps {
  holes: HoleData[];
  players: Player[];
  tee: { course_rating: number; slope_rating: number; par: number };
  roundType: string;
  onComplete: (scores: Record<string, Record<number, number>>) => void;
  saving?: boolean;
}

export default function ScorecardEntry({
  holes,
  players,
  tee,
  roundType,
  onComplete,
  saving = false,
}: ScorecardEntryProps) {
  // scores[playerId][holeNumber] = strokes
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({});

  const frontHoles = holes.filter((h) => h.hole_number <= 9);
  const backHoles = holes.filter((h) => h.hole_number > 9);
  const showFront = roundType !== "9-back";
  const showBack = roundType !== "9-front";

  const visibleHoles = [
    ...(showFront ? frontHoles : []),
    ...(showBack ? backHoles : []),
  ];

  function setScore(playerId: string, holeNumber: number, value: number | null) {
    setScores((prev) => {
      const playerScores = { ...(prev[playerId] || {}) };
      if (value == null) {
        delete playerScores[holeNumber];
      } else {
        playerScores[holeNumber] = value;
      }
      return { ...prev, [playerId]: playerScores };
    });
  }

  function getPlayerTotal(playerId: string, nineHoles: HoleData[]): number {
    const ps = scores[playerId] || {};
    return nineHoles.reduce((sum, h) => sum + (ps[h.hole_number] || 0), 0);
  }

  function getPlayerGrandTotal(playerId: string): number {
    const ps = scores[playerId] || {};
    return visibleHoles.reduce((sum, h) => sum + (ps[h.hole_number] || 0), 0);
  }

  function getPlayerHolesScored(playerId: string): number {
    const ps = scores[playerId] || {};
    return visibleHoles.filter((h) => ps[h.hole_number] != null).length;
  }

  // Tab index: per player, all holes in order
  // Player 0 holes: 1..N, Player 1 holes: N+1..2N, etc.
  const holeCount = visibleHoles.length;
  function tabIdx(playerIndex: number, holeIndex: number): number {
    return playerIndex * holeCount + holeIndex + 1;
  }

  const allComplete = players.every((p) => getPlayerHolesScored(p.id) === visibleHoles.length);
  const anyScored = players.some((p) => getPlayerHolesScored(p.id) > 0);

  function renderNine(nineHoles: HoleData[], label: string) {
    const ninePar = nineHoles.reduce((sum, h) => sum + h.par, 0);

    return (
      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-500 mb-1.5">{label}</div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs border-collapse min-w-[360px]">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1 pr-1 font-medium w-16 sticky left-0 bg-white z-10">Hole</th>
                {nineHoles.map((h) => (
                  <th key={h.hole_number} className="text-center py-1 font-medium w-8">
                    {h.hole_number}
                  </th>
                ))}
                <th className="text-center py-1 font-bold w-10 border-l border-gray-200">
                  {label.includes("Front") ? "Out" : "In"}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Par row */}
              <tr className="text-gray-500 border-b border-gray-200">
                <td className="py-1 pr-1 font-medium sticky left-0 bg-white z-10">Par</td>
                {nineHoles.map((h) => (
                  <td key={h.hole_number} className="text-center py-1">{h.par}</td>
                ))}
                <td className="text-center py-1 font-medium border-l border-gray-200">{ninePar}</td>
              </tr>

              {/* Hdcp row */}
              <tr className="text-gray-400 border-b border-gray-100">
                <td className="py-1 pr-1 font-medium sticky left-0 bg-white z-10">Hdcp</td>
                {nineHoles.map((h) => (
                  <td key={h.hole_number} className="text-center py-0.5">{h.handicap_index}</td>
                ))}
                <td className="border-l border-gray-200"></td>
              </tr>

              {/* Player rows */}
              {players.map((player, pi) => {
                const playerTotal = getPlayerTotal(player.id, nineHoles);
                const totalToPar = playerTotal - ninePar;

                return (
                  <tr key={player.id} className="border-b border-gray-100">
                    <td className="py-1 pr-1 font-medium text-gray-700 truncate max-w-[64px] sticky left-0 bg-white z-10" title={player.name}>
                      {player.name}
                    </td>
                    {nineHoles.map((h) => {
                      const val = scores[player.id]?.[h.hole_number];
                      const colorClass = val != null ? getScoreColorClass(val, h.par) : "";
                      // Find the index in the full visible holes array for tab ordering
                      const holeIdx = visibleHoles.findIndex((vh) => vh.hole_number === h.hole_number);

                      return (
                        <td key={h.hole_number} className="py-0.5 px-0.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={15}
                            value={val ?? ""}
                            onChange={(e) => {
                              const v = e.target.value ? parseInt(e.target.value) : null;
                              setScore(player.id, h.hole_number, v);
                            }}
                            tabIndex={tabIdx(pi, holeIdx)}
                            className={`w-full text-center rounded py-1 text-xs font-medium border focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              colorClass || "border-gray-200 bg-white"
                            }`}
                            style={{ minWidth: "28px" }}
                          />
                        </td>
                      );
                    })}
                    <td className={`text-center py-1 font-bold border-l border-gray-200 ${
                      playerTotal > 0 ? "text-gray-900" : "text-gray-400"
                    }`}>
                      {playerTotal || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showFront && frontHoles.length > 0 && renderNine(frontHoles, "Front 9")}
      {showBack && backHoles.length > 0 && renderNine(backHoles, "Back 9")}

      {/* Grand totals */}
      {anyScored && (
        <div className="space-y-2 mb-4">
          {players.map((player) => {
            const total = getPlayerGrandTotal(player.id);
            const totalPar = visibleHoles.reduce((sum, h) => sum + h.par, 0);
            const toPar = total - totalPar;
            const holesScored = getPlayerHolesScored(player.id);
            const diff = holesScored === visibleHoles.length && total > 0
              ? calculateDifferential(total, tee.course_rating, tee.slope_rating)
              : null;

            return (
              <div key={player.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-700">
                  {players.length > 1 ? player.name : "Total"}
                </span>
                <div className="flex items-center gap-3">
                  {total > 0 && (
                    <>
                      <span className="text-sm font-bold text-gray-900">{total}</span>
                      <span className={`text-xs font-medium ${
                        toPar > 0 ? "text-red-600" : toPar < 0 ? "text-green-600" : "text-gray-600"
                      }`}>
                        {toPar > 0 ? "+" : ""}{toPar}
                      </span>
                      {diff != null && (
                        <span className="text-xs text-gray-500">
                          Diff: {diff.toFixed(1)}
                        </span>
                      )}
                    </>
                  )}
                  <span className="text-xs text-gray-400">
                    {holesScored}/{visibleHoles.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onComplete(scores)}
        disabled={!allComplete || saving}
        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {saving
          ? "Saving..."
          : allComplete
            ? "Save Round"
            : `Enter all holes to save (${players.reduce((sum, p) => sum + getPlayerHolesScored(p.id), 0)}/${players.length * visibleHoles.length})`
        }
      </button>
    </div>
  );
}
