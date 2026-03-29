"use client";

import { useState, useEffect, useCallback } from "react";

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

export function BspitwContent({
  tripId,
  startDate,
}: {
  tripId: string;
  startDate: string;
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/bspitw?trip_id=${tripId}`);
    const data = await res.json();
    setLeaderboard(data.leaderboard || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const DAYS = [2, 3, 4];
  const gridCols = { gridTemplateColumns: "2rem 1fr repeat(3, 3rem) 3.5rem" };

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">BSPITW</h1>
        <p className="text-sm text-gray-500 mt-1">
          Best Scramble Partner In The World. Points from net under par, on-green tee shots, and holed-out shots.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
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
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">
                      {entry.display_name}
                    </span>
                    {entry.owner_name && (
                      <span className="text-[10px] text-gray-400 truncate block">
                        Owner: {entry.owner_name}
                      </span>
                    )}
                  </div>
                </div>
                {DAYS.map((d) => {
                  const dayPts = entry.days[d];
                  return (
                    <div key={d} className="px-1 py-2 text-center text-xs text-gray-600">
                      {dayPts ? dayPts.total : "—"}
                    </div>
                  );
                })}
                <div className="px-2 py-2 text-center text-sm font-bold text-gray-900">
                  {entry.total_points}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && leaderboard.length > 0 && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-1">
          <p><span className="font-semibold text-gray-700">Net Under Par:</span> 1 pt per stroke team is under par (net). Shared by all team members.</p>
          <p><span className="font-semibold text-gray-700">On Green:</span> 1 pt per tee shot that lands on the green.</p>
          <p><span className="font-semibold text-gray-700">Holed Out:</span> 1 pt per shot holed from outside flagstick length.</p>
        </div>
      )}
    </div>
  );
}
