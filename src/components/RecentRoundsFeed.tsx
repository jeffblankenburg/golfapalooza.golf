"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";

interface RecentRound {
  round_id: string;
  round_player_id: string;
  round_type: string;
  round_date: string;
  completed_at: string | null;
  player: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  course_name: string;
  tee_name: string | null;
  tee_color: string | null;
  gross_score: number;
  par: number;
  score_to_par: number;
  is_incomplete: boolean;
  holes_played: number;
  expected_holes: number;
}

// Relative label for when a round was *played* — always keyed off round_date
// (the calendar date the round happened), never completed_at. A backfilled
// historical round is entered/completed today but was played long ago; keying
// off completed_at made those read as "Today" (issue #143). round_date is the
// source of truth, and the feed already sorts by it.
function formatRelDate(roundDate: string): string {
  const [y, m, d] = roundDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreColor(toPar: number): string {
  if (toPar < 0) return "text-green-700";
  if (toPar > 0) return "text-red-600";
  return "text-gray-600";
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  if (toPar > 0) return `+${toPar}`;
  return String(toPar);
}

export function RecentRoundsFeed() {
  const [rounds, setRounds] = useState<RecentRound[] | null>(null);

  useEffect(() => {
    fetch("/api/rounds/recent?limit=25")
      .then((res) => (res.ok ? res.json() : { rounds: [] }))
      .then((data) => setRounds(data.rounds || []))
      .catch(() => setRounds([]));
  }, []);

  if (rounds === null) {
    return (
      <div className="mt-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recent Rounds
        </h2>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm h-[120px] flex items-center justify-center text-xs text-gray-400">
          Loading…
        </div>
      </div>
    );
  }

  if (rounds.length === 0) return null;

  return (
    <div className="mt-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Recent Rounds
      </h2>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-y-auto max-h-[370px]">
        <ul className="divide-y divide-gray-100">
          {rounds.map((r) => {
            const teeDot = getTeeDotStyle(r.tee_color);
            const initial = r.player.display_name?.[0]?.toUpperCase() || "?";
            const nineTag = r.round_type === "9-back" ? " (Back 9)" : r.round_type === "9-front" ? " (Front 9)" : "";
            return (
              <li key={r.round_player_id}>
                <Link
                  href={`/my-rounds/rounds/${r.round_id}`}
                  className="flex items-center gap-3 px-3 py-2.5 active:bg-gray-50"
                >
                  {/* Avatar */}
                  {r.player.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.player.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                      {initial}
                    </div>
                  )}

                  {/* Loozer + course/tee */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {r.player.display_name}
                    </p>
                    <p className="text-[0.6875rem] text-gray-500 truncate flex items-center gap-1">
                      <span
                        className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${teeDot.className || ""}`}
                        style={teeDot.style}
                      />
                      <span className="truncate">{r.course_name}{nineTag}</span>
                    </p>
                  </div>

                  {/* Score block */}
                  <div className="flex items-baseline gap-1 flex-shrink-0 tabular-nums">
                    <span className="text-base font-bold text-gray-900">
                      {r.gross_score}
                    </span>
                    {r.is_incomplete ? (
                      <span
                        className="text-xs font-semibold text-amber-700"
                        title={`Incomplete round — ${r.holes_played} of ${r.expected_holes} holes`}
                      >
                        {r.holes_played}/{r.expected_holes}
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold ${scoreColor(r.score_to_par)}`}>
                        {formatToPar(r.score_to_par)}
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <span className="text-[0.6875rem] text-gray-400 flex-shrink-0 w-10 text-right tabular-nums">
                    {formatRelDate(r.round_date)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
