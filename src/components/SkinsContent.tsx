"use client";

import { useState, useEffect, useCallback } from "react";

interface Contest {
  id: string;
  name: string;
  day_number: number;
}

interface SkinTeam {
  id: string;
  team_handicap: number;
  members: { display_name: string; avatar_url: string | null }[];
  skins: number;
  winningHoles: { hole: number; score: number | null; par: number | null }[];
}

interface SkinsData {
  complete: boolean;
  message?: string;
  totalSkins?: number;
  participantCount?: number;
  teams?: SkinTeam[];
}

function ScoreNotation({ score, par }: { score: number | null; par: number | null }) {
  if (score === null || par === null) {
    return <span className="text-xs font-bold text-gray-900">—</span>;
  }

  const diff = score - par;

  if (diff <= -2) {
    // Eagle or better: double circle
    return (
      <div className="relative flex items-center justify-center w-[22px] h-[22px] mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] leading-none font-bold text-green-700">{score}</span>
      </div>
    );
  }

  if (diff === -1) {
    // Birdie: single circle
    return (
      <div className="relative flex items-center justify-center w-[18px] h-[18px] mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] leading-none font-bold text-green-700">{score}</span>
      </div>
    );
  }

  if (diff === 1) {
    // Bogey: single square
    return (
      <div className="relative flex items-center justify-center w-[18px] h-[18px] mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
        <span className="relative z-10 text-[10px] leading-none font-bold text-gray-900">{score}</span>
      </div>
    );
  }

  if (diff >= 2) {
    // Double bogey+: double square
    return (
      <div className="relative flex items-center justify-center w-[22px] h-[22px] mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
        <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
        <span className="relative z-10 text-[10px] leading-none font-bold text-gray-900">{score}</span>
      </div>
    );
  }

  // Par: plain number
  return <span className="text-xs font-bold text-gray-900">{score}</span>;
}

function getDayLabel(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function SkinsContent({
  contests,
  startDate,
}: {
  contests: Contest[];
  startDate: string;
}) {
  const [selectedDay, setSelectedDay] = useState<number>(contests[0]?.day_number || 2);
  const [data, setData] = useState<SkinsData | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedContest = contests.find((c) => c.day_number === selectedDay);

  const fetchData = useCallback(async () => {
    if (!selectedContest) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/skins?contest_id=${selectedContest.id}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [selectedContest]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (contests.length === 0) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No scramble contests found.
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Skins</h1>

      {/* Day tabs */}
      <div className="flex gap-2">
        {contests.map((c) => (
          <button
            key={c.day_number}
            onClick={() => setSelectedDay(c.day_number)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedDay === c.day_number
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600 active:bg-gray-200"
            }`}
          >
            {getDayLabel(startDate, c.day_number)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && data && !data.complete && (
        <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-200 text-center">
          <p className="text-sm text-amber-700 font-medium">
            {data.message || "Scores still being entered"}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Skins will be calculated once all teams have complete scores.
          </p>
        </div>
      )}

      {!loading && data?.complete && data.teams && (() => {
        const pot = (data.participantCount || 0) * 10;
        const totalSkins = data.totalSkins || 0;

        return (
          <div className="space-y-3">
            <div className="bg-green-50 rounded-xl px-4 py-2 border border-green-200 text-center">
              <span className="text-sm text-green-700 font-semibold">
                {totalSkins} skin{totalSkins !== 1 ? "s" : ""} awarded
              </span>
              {pot > 0 && (
                <span className="text-sm text-green-600 ml-2">
                  &middot; ${pot} pot
                </span>
              )}
            </div>

            {data.teams.map((team) => {
              const winnings = totalSkins > 0 && pot > 0
                ? (team.skins / totalSkins) * pot
                : 0;

              return (
                <div
                  key={team.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2"
                >
                  {/* Row 1: Player names + skins total */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {team.members.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-900">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                              {(m.display_name || "?")[0].toUpperCase()}
                            </span>
                          )}
                          {m.display_name}
                        </span>
                      ))}
                    </div>
                    <div className="flex-shrink-0 text-right ml-3">
                      <span className={`text-2xl font-bold ${team.skins > 0 ? "text-amber-600" : "text-gray-300"}`}>
                        {team.skins}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase ml-1">
                        skin{team.skins !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Winning holes grid + dollar amount */}
                  {(team.winningHoles.length > 0 || winnings > 0) && (
                    <div className="flex items-end justify-between">
                      <div className="flex-1 min-w-0">
                        {team.winningHoles.length > 0 && (
                          <div className="inline-grid gap-0 border border-amber-200 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${team.winningHoles.length}, minmax(28px, 1fr))` }}>
                            {team.winningHoles.map((wh) => (
                              <div key={wh.hole} className="text-center text-[10px] font-semibold text-amber-700 bg-amber-50 px-1 py-0.5 border-b border-amber-200">
                                {wh.hole}
                              </div>
                            ))}
                            {team.winningHoles.map((wh) => (
                              <div key={wh.hole} className="flex items-center justify-center bg-white px-1 py-1">
                                <ScoreNotation score={wh.score} par={wh.par} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {winnings > 0 && (
                        <div className="flex-shrink-0 text-right ml-3">
                          <span className="text-2xl font-bold text-green-600">
                            ${Math.round(winnings / 5) * 5}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
