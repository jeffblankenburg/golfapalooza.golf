"use client";

import { useState, useEffect, useCallback } from "react";

interface Contest {
  id: string;
  name: string;
  day_number: number;
}

interface TeamMember {
  display_name: string;
  avatar_url: string | null;
}

interface Team {
  id: string;
  team_handicap: number;
  gross_score: number | null;
  course_par: number;
  members: TeamMember[];
}

interface HoleScore {
  team_id: string;
  hole_number: number;
  strokes: number;
}

interface HoleInfo {
  hole_number: number;
  par: number;
  handicap_index: number;
}

interface ScorecardData {
  teams: Team[];
  holeScores: HoleScore[];
  holes: HoleInfo[];
}

function ScoreCell({ score, par }: { score: number | undefined; par: number }) {
  if (score === undefined) {
    return <td className="px-0 py-1 text-center text-gray-300">—</td>;
  }

  const diff = score - par;
  const num = <span className="relative z-10 text-[10px] leading-none font-bold">{score}</span>;

  if (diff <= -2) {
    // Eagle or better: double circle
    return (
      <td className="px-0 py-1">
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[22px] h-[22px]">
            <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
            <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
            <span className="relative z-10 text-[10px] leading-none font-bold text-green-700">{score}</span>
          </div>
        </div>
      </td>
    );
  }

  if (diff === -1) {
    // Birdie: single circle
    return (
      <td className="px-0 py-1">
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[18px] h-[18px]">
            <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
            <span className="relative z-10 text-[10px] leading-none font-bold text-green-700">{score}</span>
          </div>
        </div>
      </td>
    );
  }

  if (diff === 1) {
    // Bogey: single square
    return (
      <td className="px-0 py-1">
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[18px] h-[18px]">
            <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
            <span className="relative z-10 text-[10px] leading-none font-bold text-gray-900">{score}</span>
          </div>
        </div>
      </td>
    );
  }

  if (diff >= 2) {
    // Double bogey+: double square
    return (
      <td className="px-0 py-1">
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[22px] h-[22px]">
            <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
            <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
            <span className="relative z-10 text-[10px] leading-none font-bold text-gray-900">{score}</span>
          </div>
        </div>
      </td>
    );
  }

  // Par: plain number
  return (
    <td className="px-0 py-1 text-center text-[10px] font-medium text-gray-900">
      {num}
    </td>
  );
}

function getDayLabel(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function calcNet(team: Team): number | null {
  if (team.gross_score === null) return null;
  return team.gross_score - team.team_handicap;
}

function formatNetRelPar(net: number, par: number): string {
  const diff = net - par;
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function ScorecardsContent({
  contests,
  startDate,
}: {
  contests: Contest[];
  startDate: string;
}) {
  const [selectedDay, setSelectedDay] = useState<number>(contests[0]?.day_number || 2);
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedContest = contests.find((c) => c.day_number === selectedDay);

  const fetchData = useCallback(async () => {
    if (!selectedContest) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/scorecards?contest_id=${selectedContest.id}`);
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

  const holes = data?.holes || [];
  const front9 = holes.filter((h) => h.hole_number <= 9);
  const back9 = holes.filter((h) => h.hole_number > 9);
  const front9Par = front9.reduce((sum, h) => sum + h.par, 0);
  const back9Par = back9.reduce((sum, h) => sum + h.par, 0);
  const totalPar = front9Par + back9Par;

  // Build score lookup
  const scoreMap: Record<string, Record<number, number>> = {};
  for (const s of data?.holeScores || []) {
    if (!scoreMap[s.team_id]) scoreMap[s.team_id] = {};
    scoreMap[s.team_id][s.hole_number] = s.strokes;
  }

  // Sort teams by net score ascending (lower is better)
  const teams = [...(data?.teams || [])].sort((a, b) => {
    const na = calcNet(a);
    const nb = calcNet(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return 0;
  });

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Scorecards</h1>

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

      {!loading && teams.length === 0 && (
        <p className="text-gray-500 text-center py-8">No teams or scores yet.</p>
      )}

      {!loading && teams.length > 0 && (
        <div className="space-y-4">
          {teams.map((team) => {
            const teamScores = scoreMap[team.id] || {};
            const front9Total = front9.reduce((s, h) => s + (teamScores[h.hole_number] || 0), 0);
            const back9Total = back9.reduce((s, h) => s + (teamScores[h.hole_number] || 0), 0);
            const hasFront = front9.some((h) => teamScores[h.hole_number] !== undefined);
            const hasBack = back9.some((h) => teamScores[h.hole_number] !== undefined);
            const net = calcNet(team);

            return (
              <div key={team.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Team header */}
                <div className="px-3 py-2 border-b border-gray-100 flex items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
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
                    <p className="text-xs text-gray-400 mt-1">
                      Team Handicap: {team.team_handicap}
                      {team.gross_score !== null && (
                        <>
                          <span className="ml-3">Raw: {team.gross_score}</span>
                          <span className="ml-3">Net: {net}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {net !== null && (
                    <div className="flex-shrink-0 ml-3">
                      <span className={`text-2xl font-bold ${net <= totalPar ? "text-green-700" : "text-red-600"}`}>
                        {formatNetRelPar(net, totalPar)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Scorecard grid — fixed columns so front/back 9 align */}
                {(front9.length > 0 || back9.length > 0) && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "28px" }} />
                        {Array.from({ length: 9 }).map((_, i) => (
                          <col key={i} />
                        ))}
                        <col style={{ width: "30px" }} />
                      </colgroup>

                      {/* Front 9 */}
                      {front9.length > 0 && (
                        <>
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-1 py-1 text-left text-gray-400 font-medium">Hole</th>
                              {front9.map((h) => (
                                <th key={h.hole_number} className="px-0 py-1 text-center text-gray-400 font-medium">
                                  {h.hole_number}
                                </th>
                              ))}
                              <th className="px-0 py-1 text-center text-gray-500 font-semibold">Out</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-gray-100">
                              <td className="px-1 py-1 text-gray-400 font-medium">Par</td>
                              {front9.map((h) => (
                                <td key={h.hole_number} className="px-0 py-1 text-center text-gray-400">
                                  {h.par}
                                </td>
                              ))}
                              <td className="px-0 py-1 text-center text-gray-500 font-semibold">{front9Par}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td></td>
                              {front9.map((h) => (
                                <ScoreCell key={h.hole_number} score={teamScores[h.hole_number]} par={h.par} />
                              ))}
                              <td className="px-0 py-1 text-center text-gray-900 font-semibold">
                                {hasFront ? front9Total : "—"}
                              </td>
                            </tr>
                          </tbody>
                        </>
                      )}

                      {/* Back 9 */}
                      {back9.length > 0 && (
                        <>
                          <thead>
                            <tr className="bg-gray-50 border-t border-gray-200">
                              <th className="px-1 py-1 text-left text-gray-400 font-medium">Hole</th>
                              {back9.map((h) => (
                                <th key={h.hole_number} className="px-0 py-1 text-center text-gray-400 font-medium">
                                  {h.hole_number}
                                </th>
                              ))}
                              <th className="px-0 py-1 text-center text-gray-500 font-semibold">In</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-gray-100">
                              <td className="px-1 py-1 text-gray-400 font-medium">Par</td>
                              {back9.map((h) => (
                                <td key={h.hole_number} className="px-0 py-1 text-center text-gray-400">
                                  {h.par}
                                </td>
                              ))}
                              <td className="px-0 py-1 text-center text-gray-500 font-semibold">{back9Par}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td></td>
                              {back9.map((h) => (
                                <ScoreCell key={h.hole_number} score={teamScores[h.hole_number]} par={h.par} />
                              ))}
                              <td className="px-0 py-1 text-center text-gray-900 font-semibold">
                                {hasBack ? back9Total : "—"}
                              </td>
                            </tr>
                          </tbody>
                        </>
                      )}

                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
