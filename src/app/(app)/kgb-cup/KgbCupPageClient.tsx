"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { KgbCupResults } from "./KgbCupResults";
import { getTimezoneAbbreviation } from "@/lib/utils/timezone";

interface TeeSheetPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamColor: string | null;
}

interface TeeSheetGroup {
  id: string;
  teeTime: string | null;
  startingHole: number | null;
  players: TeeSheetPlayer[];
}

function formatTeeTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export function KgbCupPageClient({
  contestId,
  startDate,
  kgbDayNumber,
  firstTeeTime,
  teeSheetGroups,
  showTeeSheet,
  simulatedDate,
  timezone,
}: {
  contestId: string;
  startDate: string;
  kgbDayNumber: number;
  firstTeeTime: string | null;
  teeSheetGroups: TeeSheetGroup[];
  showTeeSheet: boolean;
  simulatedDate: string | null;
  timezone: string | null;
}) {
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    // If no tee sheet data or tee times not enabled, always show results
    if (!showTeeSheet || teeSheetGroups.length === 0 || !firstTeeTime) {
      setShowResults(true);
      return;
    }

    const checkTime = () => {
      let now: Date;
      if (simulatedDate) {
        if (simulatedDate.includes("T")) {
          const [datePart, timePart] = simulatedDate.split("T");
          const [y, m, d] = datePart.split("-").map(Number);
          const [h, min] = timePart.split(":").map(Number);
          now = new Date(y, m - 1, d, h, min);
        } else {
          const [y, m, d] = simulatedDate.split("-").map(Number);
          now = new Date(y, m - 1, d, 12, 0);
        }
      } else {
        now = new Date();
      }

      // Check if today is KGB Cup day
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const tripStart = new Date(sy, sm - 1, sd);
      const diffDays = Math.floor((now.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      const todayDayNumber = diffDays + 1;

      if (todayDayNumber !== kgbDayNumber) {
        // Not KGB Cup day — show tee sheet if before, results if after
        setShowResults(todayDayNumber > kgbDayNumber);
        return;
      }

      // It's KGB Cup day — check if we're within 1 hour of first tee time
      const [hh, mm] = firstTeeTime!.split(":").map(Number);
      const teeDate = new Date(now);
      teeDate.setHours(hh, mm, 0, 0);
      const oneHourBefore = new Date(teeDate.getTime() - 60 * 60 * 1000);

      setShowResults(now >= oneHourBefore);
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [showTeeSheet, teeSheetGroups.length, firstTeeTime, simulatedDate, startDate, kgbDayNumber]);

  if (showResults) {
    return <KgbCupResults contestId={contestId} />;
  }

  // Render tee sheet
  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link
        href="/contests"
        className="flex items-center gap-1 text-indigo-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Contests
      </Link>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>
        <p className="text-sm text-gray-500 mt-1">Tee Sheet</p>
      </div>

      <div className="space-y-3">
        {teeSheetGroups.map((group, i) => (
          <div
            key={group.id}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="px-4 py-3 flex items-center gap-3">
              {/* Tee time & starting hole */}
              <div className="flex-shrink-0 w-20">
                {group.teeTime ? (
                  <p className="text-sm font-bold text-green-700">
                    {formatTeeTime(group.teeTime)}
                    {timezone && (
                      <span className="ml-1 text-[10px] font-normal text-gray-400">
                        {getTimezoneAbbreviation(timezone)}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-gray-300">TBD</p>
                )}
                {group.startingHole && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Hole {group.startingHole}
                  </p>
                )}
              </div>

              {/* Players with team color indicators */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {group.players.map((player) => (
                    <span
                      key={player.id}
                      className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 bg-gray-50 rounded-full text-xs text-gray-900"
                    >
                      {/* Team color dot */}
                      {player.teamColor && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: player.teamColor }}
                        />
                      )}
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                          {(player.displayName || "?")[0].toUpperCase()}
                        </span>
                      )}
                      {player.displayName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {teeSheetGroups.length === 0 && (
          <p className="text-gray-400 text-center py-8 text-sm">
            Tee times will be posted soon.
          </p>
        )}
      </div>
    </div>
  );
}
