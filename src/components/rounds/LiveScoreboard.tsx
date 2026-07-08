"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToRound } from "@/lib/realtime/round-channel";

export interface ScoreboardHole {
  hole_number: number;
  par: number;
}

export interface ScoreboardPlayer {
  round_player_id: string;
  name: string;
  is_guest: boolean;
  scores: { hole_number: number; strokes: number }[];
}

export interface ScoreboardRound {
  id: string;
  round_type: string;
  status: string;
  course_name: string;
}

type ConnState = "connecting" | "live" | "offline";

/**
 * Read-only live scoreboard (issue #140). Renders a scorecard grid for a round
 * and merges realtime score updates — but never lets anyone edit. This is the
 * surface a favorite-notification click lands on; distinct from the roster-only
 * score-entry page at /my-rounds/rounds/{id}/live.
 */
export function LiveScoreboard({
  round,
  holes,
  players: initialPlayers,
}: {
  round: ScoreboardRound;
  holes: ScoreboardHole[];
  players: ScoreboardPlayer[];
}) {
  const [status, setStatus] = useState(round.status);
  const [conn, setConn] = useState<ConnState>(
    round.status === "in_progress" ? "connecting" : "live"
  );
  // Cell scores keyed by `${round_player_id}:${hole}`.
  const [cells, setCells] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    for (const p of initialPlayers) {
      for (const s of p.scores) m.set(`${p.round_player_id}:${s.hole_number}`, s.strokes);
    }
    return m;
  });

  const visibleHoles = useMemo(() => {
    const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
    if (round.round_type === "9-front") return sorted.filter((h) => h.hole_number <= 9);
    if (round.round_type === "9-back") return sorted.filter((h) => h.hole_number > 9);
    return sorted;
  }, [holes, round.round_type]);

  const parByHole = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of visibleHoles) m.set(h.hole_number, h.par);
    return m;
  }, [visibleHoles]);

  const totalPar = useMemo(
    () => visibleHoles.reduce((s, h) => s + h.par, 0),
    [visibleHoles]
  );

  // Only subscribe while the round is live.
  useEffect(() => {
    if (status !== "in_progress") return;
    const unsub = subscribeToRound(round.id, {
      onScoreChange: ({ kind, row, old }) => {
        setCells((prev) => {
          const next = new Map(prev);
          if (kind === "DELETE") {
            const o = old;
            if (o) next.delete(`${o.round_player_id}:${o.hole_number}`);
          } else if (row) {
            next.set(`${row.round_player_id}:${row.hole_number}`, row.strokes);
          }
          return next;
        });
      },
      onRoundChange: ({ row }) => {
        if (row?.status && row.status !== "in_progress") setStatus(row.status);
      },
      onStatusChange: (s) => {
        setConn(s === "SUBSCRIBED" ? "live" : s === "CLOSED" ? "offline" : "connecting");
      },
    });
    return unsub;
  }, [round.id, status]);

  const playerTotals = (p: ScoreboardPlayer) => {
    let gross = 0;
    let parPlayed = 0;
    let thru = 0;
    for (const h of visibleHoles) {
      const v = cells.get(`${p.round_player_id}:${h.hole_number}`);
      if (v != null) {
        gross += v;
        parPlayed += h.par;
        thru += 1;
      }
    }
    return { gross, toPar: gross - parPlayed, thru };
  };

  const connBadge =
    conn === "live" ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live
      </span>
    ) : conn === "connecting" ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <span className="w-2 h-2 rounded-full bg-amber-400" /> Connecting…
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-300" /> Offline
      </span>
    );

  const cellColor = (strokes: number | undefined, par: number) => {
    if (strokes == null) return "text-gray-300";
    const diff = strokes - par;
    if (diff <= -2) return "text-yellow-600 font-bold";
    if (diff === -1) return "text-red-600 font-semibold";
    if (diff === 0) return "text-gray-800";
    if (diff === 1) return "text-blue-600";
    return "text-blue-800 font-semibold";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{round.course_name}</h1>
          <p className="text-xs text-gray-500">
            Par {totalPar}
            {status !== "in_progress" && " · Final"}
          </p>
        </div>
        {status === "in_progress" ? connBadge : (
          <span className="text-xs font-medium text-gray-400">Completed</span>
        )}
      </div>

      {/* Leaderboard summary */}
      <div className="space-y-1.5">
        {initialPlayers.map((p) => {
          const t = playerTotals(p);
          return (
            <div
              key={p.round_player_id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {p.name}
                </span>
                {p.is_guest && (
                  <span className="ml-1.5 text-[0.625rem] uppercase tracking-wide text-gray-400">
                    guest
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-400">Thru {t.thru}</span>
                <span className="font-bold text-gray-900 w-8 text-right">
                  {t.gross || "—"}
                </span>
                <span
                  className={`w-10 text-right font-semibold ${
                    t.toPar < 0 ? "text-red-600" : t.toPar > 0 ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  {t.thru === 0 ? "—" : t.toPar === 0 ? "E" : t.toPar > 0 ? `+${t.toPar}` : t.toPar}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-hole grid */}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-center text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium">
                Hole
              </th>
              {visibleHoles.map((h) => (
                <th key={h.hole_number} className="px-1.5 py-1 font-medium">
                  {h.hole_number}
                </th>
              ))}
            </tr>
            <tr className="text-gray-400">
              <th className="sticky left-0 bg-white px-2 py-1 text-left font-normal">
                Par
              </th>
              {visibleHoles.map((h) => (
                <td key={h.hole_number} className="px-1.5 py-1">
                  {h.par}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {initialPlayers.map((p) => (
              <tr key={p.round_player_id} className="border-t border-gray-100">
                <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-medium text-gray-700 max-w-[6rem] truncate">
                  {p.name}
                </th>
                {visibleHoles.map((h) => {
                  const v = cells.get(`${p.round_player_id}:${h.hole_number}`);
                  return (
                    <td
                      key={h.hole_number}
                      className={`px-1.5 py-1.5 ${cellColor(v, parByHole.get(h.hole_number) ?? h.par)}`}
                    >
                      {v ?? "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
