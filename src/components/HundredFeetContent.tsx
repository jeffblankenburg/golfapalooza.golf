"use client";

import { useState, useEffect, useCallback } from "react";

interface DayScore {
  feet: number;
  inches: number;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  days: Record<number, DayScore>;
  totalInches: number;
}

function formatDistance(feet: number, inches: number): string {
  return `${feet}'${inches}"`;
}

function totalToDisplay(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function getDayLabel(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function HundredFeetContent({
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

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/hundred-feet?trip_id=${tripId}`);
    const data = await res.json();
    setLeaderboard(data.leaderboard || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const DAYS = scrambleDays.length > 0 ? scrambleDays : [2, 3, 4];
  const gridCols = { gridTemplateColumns: `2rem 1fr repeat(${DAYS.length}, 3.5rem) 3.5rem` };

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">100 Feet!</h1>
        <p className="text-sm text-gray-500 mt-1">
          Distance from the pin on #18. Miss the green? 100 feet!
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && leaderboard.length === 0 && (
        <p className="text-gray-500 text-center py-8">No scores entered yet.</p>
      )}

      {!loading && leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="grid gap-0 bg-gray-50 text-xs font-semibold text-gray-500 uppercase" style={gridCols}>
            <div className="px-1 py-2 text-center">#</div>
            <div className="px-2 py-2">Player</div>
            {DAYS.map((d) => (
              <div key={d} className="px-1 py-2 text-center">{getDayLabel(startDate, d)}</div>
            ))}
            <div className="px-2 py-2 text-center">Total</div>
          </div>

          {/* Rows */}
          {leaderboard.map((entry, idx) => {
            const rank = idx + 1;
            return (
              <div
                key={entry.user_id}
                style={gridCols}
                className={`grid gap-0 border-t border-gray-100 items-center ${
                  rank <= 3 ? "bg-amber-50/50" : ""
                }`}
              >
                <div className="px-1 py-2 text-center">
                  <span className={`text-xs ${rank <= 3 ? "font-bold text-gray-700" : "text-gray-400"}`}>{rank}</span>
                </div>
                <div className="px-2 py-2 flex items-center gap-1.5 min-w-0">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold flex-shrink-0">
                      {(entry.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {entry.display_name}
                  </span>
                </div>
                {DAYS.map((d) => {
                  const dayScore = entry.days[d];
                  return (
                    <div key={d} className="px-1 py-2 text-center text-xs text-gray-600">
                      {dayScore ? formatDistance(dayScore.feet, dayScore.inches) : "—"}
                    </div>
                  );
                })}
                <div className="px-2 py-2 text-center text-sm font-bold text-gray-900">
                  {totalToDisplay(entry.totalInches)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
