"use client";

import { useState } from "react";
import { ScoreInput } from "./ScoreInput";

interface Player {
  id: string;
  display_name: string;
  scores: Record<number, number | null>;
  is_scorer: boolean;
}

interface Hole {
  number: number;
  par: number;
  handicap_index: number;
  yards: number;
}

interface ScorecardProps {
  holes: Hole[];
  players: Player[];
  onScoreChange: (playerId: string, holeNumber: number, strokes: number) => void;
  roundType: "18" | "9-front" | "9-back";
  disabled?: boolean;
}

export function Scorecard({
  holes,
  players,
  onScoreChange,
  roundType,
  disabled = false,
}: ScorecardProps) {
  const [editingCell, setEditingCell] = useState<{
    playerId: string;
    holeNumber: number;
  } | null>(null);

  const getScoreColor = (score: number | null, par: number) => {
    if (score === null || score === 0) return "";
    if (score < par) return "bg-green-100 text-green-700"; // Under par
    if (score === par) return "bg-gray-100 text-gray-900"; // Par
    if (score === par + 1) return "bg-yellow-100 text-yellow-700"; // Bogey
    return "bg-red-100 text-red-700"; // Double+
  };

  const calculateTotal = (playerScores: Record<number, number | null>, holeRange: Hole[]) => {
    return holeRange.reduce((sum, hole) => {
      const score = playerScores[hole.number];
      return sum + (score || 0);
    }, 0);
  };

  const calculatePar = (holeRange: Hole[]) => {
    return holeRange.reduce((sum, hole) => sum + hole.par, 0);
  };

  // Split holes into front and back nine
  const frontNine = holes.filter((h) => h.number <= 9);
  const backNine = holes.filter((h) => h.number > 9);

  const visibleHoles =
    roundType === "9-front"
      ? frontNine
      : roundType === "9-back"
      ? backNine
      : holes;

  const showFront = roundType === "18" || roundType === "9-front";
  const showBack = roundType === "18" || roundType === "9-back";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          {/* Hole row */}
          <tr className="bg-green-600 text-white">
            <th className="sticky left-0 z-10 bg-green-600 px-3 py-2 text-left font-medium w-24">
              Hole
            </th>
            {showFront &&
              frontNine.map((hole) => (
                <th key={hole.number} className="px-2 py-2 text-center font-bold min-w-[48px]">
                  {hole.number}
                </th>
              ))}
            {showFront && roundType === "18" && (
              <th className="px-2 py-2 text-center font-bold bg-green-700 min-w-[48px]">
                OUT
              </th>
            )}
            {showBack &&
              backNine.map((hole) => (
                <th key={hole.number} className="px-2 py-2 text-center font-bold min-w-[48px]">
                  {hole.number}
                </th>
              ))}
            {showBack && roundType === "18" && (
              <th className="px-2 py-2 text-center font-bold bg-green-700 min-w-[48px]">
                IN
              </th>
            )}
            <th className="px-2 py-2 text-center font-bold bg-green-800 min-w-[48px]">
              TOT
            </th>
          </tr>

          {/* Par row */}
          <tr className="bg-gray-100 border-b border-gray-300">
            <td className="sticky left-0 z-10 bg-gray-100 px-3 py-1 font-medium text-gray-700">
              Par
            </td>
            {showFront &&
              frontNine.map((hole) => (
                <td key={hole.number} className="px-2 py-1 text-center text-gray-600">
                  {hole.par}
                </td>
              ))}
            {showFront && roundType === "18" && (
              <td className="px-2 py-1 text-center font-medium text-gray-700 bg-gray-200">
                {calculatePar(frontNine)}
              </td>
            )}
            {showBack &&
              backNine.map((hole) => (
                <td key={hole.number} className="px-2 py-1 text-center text-gray-600">
                  {hole.par}
                </td>
              ))}
            {showBack && roundType === "18" && (
              <td className="px-2 py-1 text-center font-medium text-gray-700 bg-gray-200">
                {calculatePar(backNine)}
              </td>
            )}
            <td className="px-2 py-1 text-center font-bold text-gray-800 bg-gray-300">
              {calculatePar(visibleHoles)}
            </td>
          </tr>

          {/* Yards row */}
          <tr className="bg-gray-50 border-b border-gray-200">
            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1 font-medium text-gray-500 text-xs">
              Yards
            </td>
            {showFront &&
              frontNine.map((hole) => (
                <td key={hole.number} className="px-2 py-1 text-center text-xs text-gray-500">
                  {hole.yards}
                </td>
              ))}
            {showFront && roundType === "18" && <td className="bg-gray-100" />}
            {showBack &&
              backNine.map((hole) => (
                <td key={hole.number} className="px-2 py-1 text-center text-xs text-gray-500">
                  {hole.yards}
                </td>
              ))}
            {showBack && roundType === "18" && <td className="bg-gray-100" />}
            <td className="bg-gray-200" />
          </tr>
        </thead>

        <tbody>
          {players.map((player, playerIndex) => (
            <tr
              key={player.id}
              className={`border-b ${
                playerIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              <td
                className={`sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 ${
                  playerIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {playerIndex + 1}
                  </span>
                  <span className="truncate max-w-[80px]">{player.display_name}</span>
                </div>
              </td>

              {showFront &&
                frontNine.map((hole) => {
                  const score = player.scores[hole.number];
                  const isEditing =
                    editingCell?.playerId === player.id &&
                    editingCell?.holeNumber === hole.number;

                  return (
                    <td
                      key={hole.number}
                      className={`px-1 py-1 text-center ${getScoreColor(score, hole.par)}`}
                    >
                      {isEditing ? (
                        <ScoreInput
                          value={score}
                          par={hole.par}
                          onChange={(strokes) => {
                            onScoreChange(player.id, hole.number, strokes);
                            setEditingCell(null);
                          }}
                          size="sm"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            !disabled &&
                            player.is_scorer &&
                            setEditingCell({ playerId: player.id, holeNumber: hole.number })
                          }
                          disabled={disabled || !player.is_scorer}
                          className={`w-full h-8 font-medium ${
                            !disabled && player.is_scorer ? "hover:bg-green-50 cursor-pointer" : ""
                          }`}
                        >
                          {score || "-"}
                        </button>
                      )}
                    </td>
                  );
                })}

              {showFront && roundType === "18" && (
                <td className="px-2 py-2 text-center font-bold bg-gray-100">
                  {calculateTotal(player.scores, frontNine) || "-"}
                </td>
              )}

              {showBack &&
                backNine.map((hole) => {
                  const score = player.scores[hole.number];
                  const isEditing =
                    editingCell?.playerId === player.id &&
                    editingCell?.holeNumber === hole.number;

                  return (
                    <td
                      key={hole.number}
                      className={`px-1 py-1 text-center ${getScoreColor(score, hole.par)}`}
                    >
                      {isEditing ? (
                        <ScoreInput
                          value={score}
                          par={hole.par}
                          onChange={(strokes) => {
                            onScoreChange(player.id, hole.number, strokes);
                            setEditingCell(null);
                          }}
                          size="sm"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            !disabled &&
                            player.is_scorer &&
                            setEditingCell({ playerId: player.id, holeNumber: hole.number })
                          }
                          disabled={disabled || !player.is_scorer}
                          className={`w-full h-8 font-medium ${
                            !disabled && player.is_scorer ? "hover:bg-green-50 cursor-pointer" : ""
                          }`}
                        >
                          {score || "-"}
                        </button>
                      )}
                    </td>
                  );
                })}

              {showBack && roundType === "18" && (
                <td className="px-2 py-2 text-center font-bold bg-gray-100">
                  {calculateTotal(player.scores, backNine) || "-"}
                </td>
              )}

              <td className="px-2 py-2 text-center font-bold bg-gray-200">
                {calculateTotal(player.scores, visibleHoles) || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
