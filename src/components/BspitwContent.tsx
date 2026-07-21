"use client";

import { useState, useEffect, useCallback } from "react";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface DayPoints {
  under_par: number;
  on_green: number;
  holed_out: number;
  total: number;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  owner_name: string | null;
  handicap_index: number | null;
  under_par_points: number;
  on_green_points: number;
  holed_out_points: number;
  total_points: number;
  days: Record<number, DayPoints>;
}

function getDayLabel(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

type ViewOption =
  | "total"
  | "score"
  | "bonus"
  | "holed_out"
  | "on_green"
  | "handicap";

const VIEW_OPTIONS: { value: ViewOption; label: string }[] = [
  { value: "total", label: "Total Points" },
  { value: "score", label: "Score Points" },
  { value: "bonus", label: "Bonus Points" },
  { value: "holed_out", label: "Hole Out Points" },
  { value: "on_green", label: "Green from Tee Points" },
  { value: "handicap", label: "Highest Handicap" },
];

function getDayValue(dayPts: DayPoints | undefined, view: ViewOption): number | null {
  if (!dayPts) return null;
  switch (view) {
    case "total": return dayPts.total;
    case "score": return dayPts.under_par;
    case "bonus": return dayPts.on_green + dayPts.holed_out;
    case "holed_out": return dayPts.holed_out;
    case "on_green": return dayPts.on_green;
    case "handicap": return null;
  }
}

function getTotalValue(entry: LeaderboardEntry, view: ViewOption): string {
  switch (view) {
    case "total": return String(entry.total_points);
    case "score": return String(entry.under_par_points);
    case "bonus": return String(entry.on_green_points + entry.holed_out_points);
    case "holed_out": return String(entry.holed_out_points);
    case "on_green": return String(entry.on_green_points);
    case "handicap": return entry.handicap_index !== null ? String(entry.handicap_index) : "—";
  }
}

function getSortValue(entry: LeaderboardEntry, view: ViewOption): number {
  switch (view) {
    case "total": return entry.total_points;
    case "score": return entry.under_par_points;
    case "bonus": return entry.on_green_points + entry.holed_out_points;
    case "holed_out": return entry.holed_out_points;
    case "on_green": return entry.on_green_points;
    case "handicap": return entry.handicap_index ?? -1;
  }
}

export function BspitwContent({
  tripId,
  startDate,
  scrambleDays = [],
}: {
  tripId: string;
  startDate: string;
  scrambleDays?: number[];
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewOption>("total");
  const [finalized, setFinalized] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"total" | number>("total");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/bspitw?trip_id=${tripId}`);
    const data = await res.json();
    setLeaderboard(data.leaderboard || []);
    setFinalized(data.finalized || false);
    setWinnerId(data.winnerId || null);
    setLoading(false);
  }, [tripId]);

  // Poll every 15s so live scores tick up without a manual refresh. fetchData
  // never toggles the loading spinner mid-flight, so polls update silently.
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const DAYS = scrambleDays.length > 0 ? scrambleDays : [2, 3, 4];
  const gridCols = view === "handicap"
    ? { gridTemplateColumns: `2rem 1fr 3.5rem` }
    : { gridTemplateColumns: `2rem 1fr repeat(${DAYS.length}, 3.5rem) 3.5rem` };

  // Tiebreaker: playoff winner sorts first among tied players
  const tiebreak = (a: LeaderboardEntry, b: LeaderboardEntry): number => {
    if (winnerId) {
      if (a.user_id === winnerId) return -1;
      if (b.user_id === winnerId) return 1;
    }
    return a.display_name.localeCompare(b.display_name);
  };

  const toggleSort = (col: "total" | number) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  // Reset column sort when view changes
  useEffect(() => {
    setSortCol("total");
    setSortAsc(false);
  }, [view]);

  // Rank map (always by total descending, playoff winner breaks ties)
  const rankMap = new Map<string, number>();
  [...leaderboard]
    .sort((a, b) => b.total_points - a.total_points || tiebreak(a, b))
    .forEach((e, i) => rankMap.set(e.user_id, i + 1));

  const getColValue = (entry: LeaderboardEntry, col: "total" | number): number => {
    if (col === "total") return getSortValue(entry, view);
    const dayPts = entry.days[col];
    if (!dayPts) return 0;
    return getDayValue(dayPts, view) ?? 0;
  };

  const sorted = [...leaderboard].sort((a, b) => {
    const av = getColValue(a, sortCol);
    const bv = getColValue(b, sortCol);
    const cmp = sortAsc ? av - bv : bv - av;
    if (cmp !== 0) return cmp;
    return tiebreak(a, b);
  });

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">BSPITW</h1>
          <PinnedNoteButton pinnedTo="bspitw" />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Best Scramble Partner In The World. Points from net under par, on-green tee shots, and holed-out shots.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && leaderboard.length === 0 && (
        <p className="text-gray-500 text-center py-8">No scores entered yet.</p>
      )}

      {!loading && leaderboard.length > 0 && (
        <>
          {/* View/sort dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Show</label>
            <select
              value={view}
              onChange={(e) => setView(e.target.value as ViewOption)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-medium"
            >
              {VIEW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="grid gap-0 bg-gray-50 text-xs font-semibold text-gray-500 uppercase" style={gridCols}>
              <div className="px-1 py-2 text-center">#</div>
              <div className="px-2 py-2">Player</div>
              {view === "handicap" ? (
                <button onClick={() => toggleSort("total")} className="px-1 py-2 text-center w-full">
                  HDCP {sortCol === "total" ? (sortAsc ? "▲" : "▼") : ""}
                </button>
              ) : (
                <>
                  {DAYS.map((d) => (
                    <button key={d} onClick={() => toggleSort(d)} className="px-1 py-2 text-center w-full">
                      {getDayLabel(startDate, d)} {sortCol === d ? (sortAsc ? "▲" : "▼") : ""}
                    </button>
                  ))}
                  <button onClick={() => toggleSort("total")} className="px-1 py-2 text-center w-full">
                    Total {sortCol === "total" ? (sortAsc ? "▲" : "▼") : ""}
                  </button>
                </>
              )}
            </div>

            {/* Rows */}
            {sorted.map((entry) => {
              const rank = rankMap.get(entry.user_id) || 0;
              const showMedal = finalized && rank <= 3;
              const medalBg = showMedal
                ? rank === 1
                  ? "bg-gradient-to-r from-yellow-100 via-amber-50 to-yellow-100"
                  : rank === 2
                  ? "bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
                  : "bg-gradient-to-r from-orange-100 via-amber-50 to-orange-100"
                : "";
              return (
                <div
                  key={entry.user_id}
                  style={gridCols}
                  className={`grid gap-0 border-t border-gray-100 items-center relative overflow-hidden ${medalBg}`}
                >
                  {showMedal && (
                    <div
                      className="absolute top-0 bottom-0 left-0 w-1/2 pointer-events-none"
                      style={{
                        background: rank === 1
                          ? "linear-gradient(90deg, transparent, rgba(251,191,36,0.2), transparent)"
                          : rank === 2
                          ? "linear-gradient(90deg, transparent, rgba(156,163,175,0.25), transparent)"
                          : "linear-gradient(90deg, transparent, rgba(251,146,60,0.2), transparent)",
                        animation: "shimmer 4s ease-in-out infinite",
                        animationDelay: `${(rank - 1) * 0.5}s`,
                      }}
                    />
                  )}
                  <div className="px-1 py-2 text-center">
                    <span className={`text-xs ${rank <= 3 ? "font-bold text-gray-700" : "text-gray-400"}`}>{rank}</span>
                  </div>
                  <div className="px-2 py-2 flex items-center gap-1.5 min-w-0">
                    {entry.avatar_url ? (
                      <img src={entry.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold flex-shrink-0">
                        {(entry.display_name || "?")[0].toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate block">
                        {entry.display_name}
                      </span>
                      {entry.owner_name && (
                        <span className="text-[0.625rem] text-gray-400 truncate block">
                          Owner: {entry.owner_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {view === "handicap" ? (
                    /* Handicap view: single HDCP column */
                    <div className="px-1 py-2 text-center text-sm font-bold text-gray-900">
                      {entry.handicap_index !== null ? entry.handicap_index : "—"}
                    </div>
                  ) : (
                    <>
                      {/* Day columns */}
                      {DAYS.map((d) => {
                        const dayPts = entry.days[d];

                        if (view === "total") {
                          if (!dayPts) {
                            return <div key={d} className="px-1 py-2 text-center text-xs text-gray-300">—</div>;
                          }
                          return (
                            <div key={d} className="px-1 py-2 text-center text-xs text-gray-600">
                              <sup className="mr-0.5 text-[0.5625rem] font-semibold text-green-600">{dayPts.on_green}</sup>
                              {dayPts.total}
                              <sup className="ml-0.5 text-[0.5625rem] font-semibold text-amber-600">{dayPts.holed_out}</sup>
                            </div>
                          );
                        }

                        const val = getDayValue(dayPts, view);
                        return (
                          <div key={d} className="px-1 py-2 text-center text-xs text-gray-600">
                            {val !== null ? val : "—"}
                          </div>
                        );
                      })}

                      {/* Total column */}
                      <div className="px-1 py-2 text-center text-sm font-bold text-gray-900">
                        {view === "total" ? (
                          <>
                            <sup className="mr-0.5 text-[0.5625rem] font-semibold text-green-600">{entry.on_green_points}</sup>
                            {entry.total_points}
                            <sup className="ml-0.5 text-[0.5625rem] font-semibold text-amber-600">{entry.holed_out_points}</sup>
                          </>
                        ) : (
                          getTotalValue(entry, view)
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Legend */}
      {!loading && leaderboard.length > 0 && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-1">
          <p><span className="font-semibold text-gray-700">Net Under Par:</span> 1 pt per stroke team is under par (net). Shared by all team members.</p>
          <p><span className="font-semibold text-green-600">On Green</span> <sup className="text-green-600 font-semibold">G</sup>: 1 pt per tee shot that lands on the green. Shown as leading superscript.</p>
          <p><span className="font-semibold text-amber-600">Holed Out</span> <sup className="text-amber-600 font-semibold">H</sup>: 1 pt per shot holed from outside flagstick length. Shown as trailing superscript.</p>
        </div>
      )}
    </div>
  );
}
