"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { KgbCupResults } from "./KgbCupResults";
import { KgbCupHeader } from "@/components/kgb-cup/KgbCupHeader";
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

type DisplayMode = "forming" | "leaderboard" | "teesheet" | "hidden";

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
  hasAnyScores,
  scoringLive,
  contestComplete,
  teeSheetPublished,
  simulatedDate,
  timezone,
  headerAction,
}: {
  contestId: string;
  startDate: string;
  kgbDayNumber: number;
  firstTeeTime: string | null;
  teeSheetGroups: TeeSheetGroup[];
  hasTeams: boolean;
  hasAnyScores: boolean;
  scoringLive: boolean;
  contestComplete: boolean;
  teeSheetPublished: boolean;
  simulatedDate: string | null;
  timezone: string | null;
  headerAction?: React.ReactNode;
}) {
  // `scoringLive` is retained in the props contract but isn't load-bearing anymore —
  // we drive teesheet/leaderboard off actual score presence instead.
  void scoringLive;

  const [displayMode, setDisplayMode] = useState<DisplayMode>("forming");

  useEffect(() => {
    // Verified always wins — once the contest is officially over, show the leaderboard.
    if (contestComplete) {
      setDisplayMode("leaderboard");
    } else if (!hasTeams) {
      setDisplayMode("forming");
    } else if (!teeSheetPublished) {
      // Admin explicitly chose to hide.
      setDisplayMode("hidden");
    } else if (hasAnyScores) {
      // At least one score has been entered — round is underway.
      setDisplayMode("leaderboard");
    } else {
      // Pairings shared but no scores yet — show the tee sheet.
      setDisplayMode("teesheet");
    }
  }, [hasTeams, hasAnyScores, contestComplete, teeSheetPublished]);

  const topBar = (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 active:bg-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>
      {headerAction}
    </div>
  );

  // State 1: Teams not yet formed
  if (displayMode === "forming") {
    return (
      <div className="px-4 pt-6 pb-8 space-y-4">
        {topBar}
        <div className="text-center">
          <KgbCupHeader size={280} />
          <p className="text-gray-500 py-8">Teams are still being formed.</p>
        </div>
      </div>
    );
  }

  // State 1b: Teams exist but admin hasn't published pairings yet
  if (displayMode === "hidden") {
    return (
      <div className="px-4 pt-6 pb-8 space-y-4">
        {topBar}
        <div className="text-center">
          <KgbCupHeader />
          <div className="mt-8 mx-auto max-w-md py-12 px-4 bg-white rounded-2xl border-2 border-dashed border-gray-300">
            <p className="text-sm font-semibold text-gray-700 mb-1">Pairings haven&apos;t been shared yet</p>
            <p className="text-xs text-gray-400">Check back when the pairings are released.</p>
          </div>
        </div>
      </div>
    );
  }

  // State 2 & 4: Leaderboard
  if (displayMode === "leaderboard") {
    return <KgbCupResults contestId={contestId} headerAction={headerAction} />;
  }

  // State 3: Tee sheet
  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      {topBar}

      <div className="text-center">
        <KgbCupHeader />
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
                        <span className="ml-1 text-[0.625rem] font-normal text-gray-400">
                          {getTimezoneAbbreviation(timezone)}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-300">TBD</p>
                  )}
                  {group.startingHole && (
                    <p className="text-[0.625rem] text-gray-400 mt-0.5">
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
                            <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5625rem] font-bold">
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
