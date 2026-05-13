"use client";

import { useState, useEffect, useCallback } from "react";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

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

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

export function HundredFeetContent({
  tripId,
  startDate,
  scrambleDays = [],
  winnerUserId = null,
  payoutAmount = 0,
  featureVisible = true,
  headerAction,
}: {
  tripId: string;
  startDate: string;
  scrambleDays?: number[];
  winnerUserId?: string | null;
  payoutAmount?: number;
  featureVisible?: boolean;
  headerAction?: React.ReactNode;
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(featureVisible);
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/hundred-feet?trip_id=${tripId}`);
    const data = await res.json();
    setLeaderboard(data.leaderboard || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    if (!featureVisible) return;
    fetchData();
  }, [featureVisible, fetchData]);

  const DAYS = scrambleDays.length > 0 ? scrambleDays : [2, 3, 4];
  const gridCols = { gridTemplateColumns: `2rem 1fr repeat(${DAYS.length}, 3.5rem) 3.5rem` };

  // Rank map (always by total ascending — lower = better)
  const rankMap = new Map<string, number>();
  [...leaderboard]
    .sort((a, b) => a.totalInches - b.totalInches)
    .forEach((e, i) => rankMap.set(e.user_id, i + 1));

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "player" ? "asc" : "asc");
    }
  };

  const toInches = (d: DayScore) => d.feet * 12 + d.inches;

  const sorted = [...leaderboard].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "player") {
      cmp = a.display_name.localeCompare(b.display_name);
    } else if (sortKey === "total") {
      cmp = a.totalInches - b.totalInches;
    } else if (sortKey.startsWith("day-")) {
      const d = parseInt(sortKey.slice(4), 10);
      const aVal = a.days[d] ? toInches(a.days[d]) : 99999;
      const bVal = b.days[d] ? toInches(b.days[d]) : 99999;
      cmp = aVal - bVal;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const SortArrow = ({ col }: { col: string }) => {
    if (sortKey !== col) return null;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">100 Feet!</h1>
          {headerAction}
          <PinnedNoteButton pinnedTo="hundred_feet" />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Distance from the pin on #18. Miss the green? 100 feet!
        </p>
      </div>

      {(() => {
        const winner = winnerUserId
          ? leaderboard.find((e) => e.user_id === winnerUserId)
          : null;
        return (
          <div className="bg-green-50 rounded-2xl border border-green-200 px-4 py-5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">
              Prize Pool
            </p>
            <p className="text-3xl font-bold text-green-700 tabular-nums mt-1">
              {payoutAmount > 0 ? fmtMoney(payoutAmount) : "—"}
            </p>
            {winner ? (
              <p className="text-xs text-green-600 mt-1">
                Won by {winner.display_name}
              </p>
            ) : payoutAmount > 0 ? (
              <p className="text-xs text-green-600 mt-1">Winner takes all</p>
            ) : null}
          </div>
        );
      })()}

      {!featureVisible && (
        <p className="text-gray-500 text-center py-8">
          100 Feet results will be available once the event begins.
        </p>
      )}

      {featureVisible && loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {featureVisible && !loading && leaderboard.length === 0 && (
        <p className="text-gray-500 text-center py-8">No scores entered yet.</p>
      )}

      {featureVisible && !loading && leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="grid gap-0 bg-gray-50 text-xs font-semibold text-gray-500 uppercase select-none" style={gridCols}>
            <div
              className="px-1 py-2 text-center cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("total")}
            >
              #<SortArrow col="total" />
            </div>
            <div
              className="px-2 py-2 cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("player")}
            >
              Player<SortArrow col="player" />
            </div>
            {DAYS.map((d) => (
              <div
                key={d}
                className="px-1 py-2 text-center cursor-pointer active:bg-gray-100"
                onClick={() => handleSort(`day-${d}`)}
              >
                {getDayLabel(startDate, d)}<SortArrow col={`day-${d}`} />
              </div>
            ))}
            <div
              className="px-2 py-2 text-center cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("total")}
            >
              Total<SortArrow col="total" />
            </div>
          </div>

          {/* Rows */}
          {sorted.map((entry) => {
            const rank = rankMap.get(entry.user_id) || 0;
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
                  {entry.user_id === winnerUserId && payoutAmount > 0 ? (
                    <span className="shrink-0 text-xs font-bold tabular-nums text-green-700">
                      {fmtMoney(payoutAmount)}
                    </span>
                  ) : null}
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
