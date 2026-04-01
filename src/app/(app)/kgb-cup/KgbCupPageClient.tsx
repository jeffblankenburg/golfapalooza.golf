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

type DisplayMode = "forming" | "leaderboard" | "teesheet";

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
  hasTeams,
  simulatedDate,
  timezone,
}: {
  contestId: string;
  startDate: string;
  kgbDayNumber: number;
  firstTeeTime: string | null;
  teeSheetGroups: TeeSheetGroup[];
  hasTeams: boolean;
  simulatedDate: string | null;
  timezone: string | null;
}) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("forming");

  useEffect(() => {
    // 1. No teams yet
    if (!hasTeams) {
      setDisplayMode("forming");
      return;
    }

    // 2. Teams exist but no tee times → leaderboard (shows teams)
    if (teeSheetGroups.length === 0) {
      setDisplayMode("leaderboard");
      return;
    }

    // 3. Tee times exist — show tee sheet unless time-based switch kicks in
    // If no actual tee time values set yet, just show tee sheet
    if (!firstTeeTime) {
      setDisplayMode("teesheet");
      return;
    }

    // 4. Time-based: switch to leaderboard 1 hour before first tee
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

      const [sy, sm, sd] = startDate.split("-").map(Number);
      const tripStart = new Date(sy, sm - 1, sd);
      const diffDays = Math.floor((now.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      const todayDayNumber = diffDays + 1;

      if (todayDayNumber < kgbDayNumber) {
        // Before KGB Cup day — show tee sheet
        setDisplayMode("teesheet");
        return;
      }

      if (todayDayNumber > kgbDayNumber) {
        // After KGB Cup day — show leaderboard
        setDisplayMode("leaderboard");
        return;
      }

      // It's KGB Cup day — check if we're within 1 hour of first tee time
      const [hh, mm] = firstTeeTime!.split(":").map(Number);
      const teeDate = new Date(now);
      teeDate.setHours(hh, mm, 0, 0);
      const oneHourBefore = new Date(teeDate.getTime() - 60 * 60 * 1000);

      setDisplayMode(now >= oneHourBefore ? "leaderboard" : "teesheet");
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [hasTeams, teeSheetGroups.length, firstTeeTime, simulatedDate, startDate, kgbDayNumber]);

  // State 1: Teams not yet formed
  if (displayMode === "forming") {
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
          <p className="text-gray-500 text-center py-8">Teams are still being formed.</p>
        </div>
      </div>
    );
  }

  // State 2 & 4: Leaderboard
  if (displayMode === "leaderboard") {
    return <KgbCupResults contestId={contestId} />;
  }

  // State 3: Tee sheet
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
        {teeSheetGroups.map((group) => {
          // Group players by team color into pairs (2 per line)
          const pairsByColor = new Map<string, TeeSheetPlayer[]>();
          for (const player of group.players) {
            const key = player.teamColor || "_none";
            if (!pairsByColor.has(key)) pairsByColor.set(key, []);
            pairsByColor.get(key)!.push(player);
          }
          const pairs = Array.from(pairsByColor.values());

          return (
            <div
              key={group.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 flex items-start gap-3">
                {/* Tee time & starting hole */}
                <div className="flex-shrink-0 w-20 pt-0.5">
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

                {/* Players grouped by team pair, 2 per line max */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {pairs.map((pair, pairIdx) => (
                    <div
                      key={pairIdx}
                      className="flex gap-1.5"
                    >
                      {pair.slice(0, 2).map((player) => (
                        <span
                          key={player.id}
                          className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs text-gray-900 border-2"
                          style={{
                            borderColor: player.teamColor || "rgb(229 231 235)",
                            backgroundColor: player.teamColor
                              ? `${player.teamColor}12`
                              : "rgb(249 250 251)",
                          }}
                        >
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
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
