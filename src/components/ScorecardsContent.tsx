"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface Contest {
  id: string;
  name: string;
  day_number: number;
  scoring_closed_at: string | null;
  verified_at: string | null;
}

interface TeamMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Team {
  id: string;
  team_handicap: number;
  gross_score: number | null;
  course_par: number;
  verified_at: string | null;
  tee_time: string | null;
  starting_hole: number | null;
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
  contest_verified?: boolean;
  tee_sheet_published_at?: string | null;
  tiebreaker_notes?: Record<string, string>; // team_id -> tiebreaker explanation
  ranked_order?: string[]; // team IDs in tiebreak-resolved order
}

/** How many strokes a team receives on a given hole */
function getStrokesReceived(teamHandicap: number, holeHandicapIndex: number): number {
  if (teamHandicap <= 0) return 0;
  const fullRounds = Math.floor(teamHandicap / 18);
  const remainder = teamHandicap % 18;
  return fullRounds + (holeHandicapIndex <= remainder ? 1 : 0);
}

type NetHighlight = "sole" | "tied" | null;

function ScoreCell({
  score,
  par,
  receivesStroke,
  netHighlight,
}: {
  score: number | undefined;
  par: number;
  receivesStroke?: boolean;
  netHighlight?: NetHighlight;
}) {
  const bgClass =
    netHighlight === "sole"
      ? "bg-sky-100"
      : netHighlight === "tied"
      ? "bg-amber-100"
      : "";

  if (score === undefined) {
    return <td className={`px-0 py-1 text-center text-gray-300 ${bgClass}`}>—</td>;
  }

  const diff = score - par;

  // Stroke indicator dot
  const strokeDot = receivesStroke ? (
    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" />
  ) : null;

  if (diff <= -2) {
    return (
      <td className={`px-0 py-1 ${bgClass}`}>
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[22px] h-[22px]">
            <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
            <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
            <span className="relative z-10 text-[0.625rem] leading-none font-bold text-green-700">{score}</span>
            {strokeDot}
          </div>
        </div>
      </td>
    );
  }

  if (diff === -1) {
    return (
      <td className={`px-0 py-1 ${bgClass}`}>
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[18px] h-[18px]">
            <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
            <span className="relative z-10 text-[0.625rem] leading-none font-bold text-green-700">{score}</span>
            {strokeDot}
          </div>
        </div>
      </td>
    );
  }

  if (diff === 1) {
    return (
      <td className={`px-0 py-1 ${bgClass}`}>
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[18px] h-[18px]">
            <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
            <span className="relative z-10 text-[0.625rem] leading-none font-bold text-gray-900">{score}</span>
            {strokeDot}
          </div>
        </div>
      </td>
    );
  }

  if (diff >= 2) {
    return (
      <td className={`px-0 py-1 ${bgClass}`}>
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center w-[22px] h-[22px]">
            <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
            <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
            <span className="relative z-10 text-[0.625rem] leading-none font-bold text-gray-900">{score}</span>
            {strokeDot}
          </div>
        </div>
      </td>
    );
  }

  // Par
  return (
    <td className={`px-0 py-1 ${bgClass}`}>
      <div className="flex items-center justify-center">
        <div className="relative">
          <span className="text-[0.625rem] leading-none font-bold text-gray-900">{score}</span>
          {strokeDot}
        </div>
      </div>
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

interface ScramblePayout {
  pot: number;
  first: number;
  second: number;
}

export function ScorecardsContent({
  contests,
  startDate,
  dayScramblePayouts = {},
}: {
  contests: Contest[];
  startDate: string;
  dayScramblePayouts?: Record<number, ScramblePayout>;
}) {
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");
  const initialDay = dayParam ? parseInt(dayParam, 10) : (contests[0]?.day_number || 2);
  const [selectedDay, setSelectedDay] = useState<number>(initialDay);
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCurrentUserId(d?.user?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  const selectedContest = contests.find((c) => c.day_number === selectedDay);
  const contestComplete = !!selectedContest?.verified_at;
  const hasAnyScores = (data?.holeScores?.length ?? 0) > 0;
  const showLeaderboard = contestComplete || hasAnyScores;
  const teeSheetPublished = !!data?.tee_sheet_published_at;

  const fetchData = useCallback(async (background = false) => {
    if (!selectedContest) {
      setData(null);
      setLoading(false);
      return;
    }

    // Poll (background=true) refetches silently so live scores tick up without
    // flashing the spinner; only the initial load / contest switch shows it.
    if (!background) setLoading(true);
    const res = await fetch(`/api/scrambles?contest_id=${selectedContest.id}`);
    const json = await res.json();

    // Offset team handicaps so the lowest team plays at 0
    if (json.teams && json.teams.length > 0) {
      const lowestHC = Math.min(...json.teams.map((t: Team) => t.team_handicap));
      for (const t of json.teams) {
        t.team_handicap = Math.max(0, t.team_handicap - lowestHC);
      }
    }

    setData(json);
    setLoading(false);
  }, [selectedContest]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(interval);
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

  // Calculate lowest net score per hole across all teams for highlighting
  const allTeams = data?.teams || [];
  const lowestNetPerHole: Record<number, { min: number; count: number }> = {};
  for (const hole of holes) {
    let min = Infinity;
    let count = 0;
    for (const t of allTeams) {
      const gross = scoreMap[t.id]?.[hole.hole_number];
      if (gross === undefined) continue;
      const strokes = getStrokesReceived(t.team_handicap, hole.handicap_index);
      const net = gross - strokes;
      if (net < min) {
        min = net;
        count = 1;
      } else if (net === min) {
        count++;
      }
    }
    if (min < Infinity) {
      lowestNetPerHole[hole.hole_number] = { min, count };
    }
  }

  function getNetHighlight(teamId: string, teamHandicap: number, hole: HoleInfo): NetHighlight {
    const gross = scoreMap[teamId]?.[hole.hole_number];
    if (gross === undefined) return null;
    const strokes = getStrokesReceived(teamHandicap, hole.handicap_index);
    const net = gross - strokes;
    const lowest = lowestNetPerHole[hole.hole_number];
    if (!lowest || net !== lowest.min) return null;
    return lowest.count === 1 ? "sole" : "tied";
  }

  // Sort teams: use server-provided tiebreak order when available, otherwise by net
  const rankedOrder = data?.ranked_order;
  const teams = [...allTeams].sort((a, b) => {
    if (rankedOrder && rankedOrder.length > 0) {
      const ai = rankedOrder.indexOf(a.id);
      const bi = rankedOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
    }
    const na = calcNet(a);
    const nb = calcNet(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return 0;
  });

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Scrambles</h1>
        <PinnedNoteButton pinnedTo="scramble" />
      </div>

      {/* Day tabs */}
      <div className="flex gap-2">
        {contests.map((c) => (
          <button
            key={c.day_number}
            onClick={() => setSelectedDay(c.day_number)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedDay === c.day_number
                ? "bg-sky-600 text-white"
                : "bg-gray-100 text-gray-600 active:bg-gray-200"
            }`}
          >
            {getDayLabel(startDate, c.day_number)}
          </button>
        ))}
      </div>

      {/* Scramble Team payouts for the selected day. Only show once
          the rest of the day's data is revealed (tee sheet published
          or leaderboard live) — keeps the page tidy pre-reveal. */}
      {!loading &&
        teams.length > 0 &&
        (showLeaderboard || teeSheetPublished) &&
        dayScramblePayouts[selectedDay] && (
          <ScramblePayoutPanel
            dayLabel={getDayLabel(startDate, selectedDay)}
            payout={dayScramblePayouts[selectedDay]}
          />
        )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && teams.length === 0 && (
        <p className="text-gray-500 text-center py-8">No teams or scores yet.</p>
      )}

      {/* Tee sheet — shown when no scores yet AND admin has published the tee sheet for this day */}
      {!loading && teams.length > 0 && !showLeaderboard && !teeSheetPublished && (
        <div className="w-full py-12 px-4 bg-white rounded-2xl border-2 border-dashed border-gray-300 text-center">
          <p className="text-sm font-semibold text-gray-700 mb-1">Teams & tee times haven&apos;t been shared yet</p>
          <p className="text-xs text-gray-400">Check back when the pairings are released.</p>
        </div>
      )}

      {!loading && teams.length > 0 && !showLeaderboard && teeSheetPublished && (
        <div className="space-y-3">
          {[...teams]
            .sort((a, b) => {
              if (a.tee_time && b.tee_time) return a.tee_time.localeCompare(b.tee_time);
              if (a.tee_time) return -1;
              if (b.tee_time) return 1;
              return 0;
            })
            .map((team) => {
              const isMyTeam =
                !!currentUserId && team.members.some((m) => m.user_id === currentUserId);
              return (
            <div
              key={team.id}
              className={`rounded-2xl shadow-sm overflow-hidden border ${
                isMyTeam ? "bg-sky-50 border-sky-300 ring-2 ring-sky-200" : "bg-white border-gray-200"
              }`}
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-shrink-0 w-20">
                  {team.tee_time ? (
                    <p className="text-sm font-bold text-green-700">
                      {new Date(`1970-01-01T${team.tee_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-300">TBD</p>
                  )}
                  {team.starting_hole && (
                    <p className="text-[0.625rem] text-gray-400 mt-0.5">Hole {team.starting_hole}</p>
                  )}
                  <p className="text-sm font-bold text-gray-700 mt-0.5">
                    Hcp {team.team_handicap}
                  </p>
                </div>
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {team.members.map((m, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-full text-xs font-medium text-gray-700 border border-gray-200">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
                          {(m.display_name || "?")[0].toUpperCase()}
                        </span>
                      )}
                      {m.display_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
              );
            })}
        </div>
      )}

      {/* Leaderboard — shown when scoring is live or contest is complete */}
      {!loading && teams.length > 0 && showLeaderboard && (
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.625rem] text-gray-500 px-1">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-sky-100 border border-sky-200" />
              Low net (sole)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-200" />
              Low net (tied)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
              Stroke hole
            </span>
          </div>

          {teams.map((team, teamIndex) => {
            const teamScores = scoreMap[team.id] || {};
            const front9Total = front9.reduce((s, h) => s + (teamScores[h.hole_number] || 0), 0);
            const back9Total = back9.reduce((s, h) => s + (teamScores[h.hole_number] || 0), 0);
            const hasFront = front9.some((h) => teamScores[h.hole_number] !== undefined);
            const hasBack = back9.some((h) => teamScores[h.hole_number] !== undefined);
            const net = calcNet(team);
            const isContestVerified = data?.contest_verified;
            const isChampion = isContestVerified && teamIndex === 0 && net !== null;
            const isRunnerUp = isContestVerified && teamIndex === 1 && net !== null;

            return (
              <div key={team.id} className={`rounded-2xl shadow-sm overflow-hidden ${
                isChampion
                  ? "bg-amber-50 border-2 border-amber-400"
                  : isRunnerUp
                  ? "bg-gray-50 border-2 border-gray-400"
                  : "bg-white border border-gray-200"
              }`}>
                {/* Champion / Runner-Up badge */}
                {(isChampion || isRunnerUp) && (
                  <div className={`px-3 py-1 text-xs font-bold uppercase tracking-wider text-center ${
                    isChampion ? "bg-amber-400 text-amber-900" : "bg-gray-400 text-white"
                  }`}>
                    {isChampion ? "Champion" : "Runner-Up"}
                  </div>
                )}
                {/* Team header */}
                <div className="px-3 py-2 border-b border-gray-100 flex items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {team.members.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-900">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
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
                  <div className="flex-shrink-0 ml-3 flex flex-col items-end gap-1">
                    {net !== null && (
                      <span className={`text-2xl font-bold ${net <= totalPar ? "text-green-700" : "text-red-600"}`}>
                        {formatNetRelPar(net, totalPar)}
                      </span>
                    )}
                    {team.verified_at ? (
                      <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-semibold text-green-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Verified
                      </span>
                    ) : Object.keys(scoreMap[team.id] || {}).length > 0 ? (
                      <span className="text-[0.625rem] font-medium text-amber-600">Unofficial</span>
                    ) : null}
                  </div>
                </div>

                {/* Tee time info when no scores entered */}
                {Object.keys(teamScores).length === 0 && (team.tee_time || team.starting_hole) && (
                  <div className="px-3 py-2 flex items-center gap-3 text-sm text-gray-600 bg-gray-50 border-b border-gray-100">
                    {team.tee_time && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {new Date(`1970-01-01T${team.tee_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    {team.starting_hole && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Hole {team.starting_hole}
                        </span>
                      </span>
                    )}
                  </div>
                )}

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
                                <ScoreCell
                                  key={h.hole_number}
                                  score={teamScores[h.hole_number]}
                                  par={h.par}
                                  receivesStroke={getStrokesReceived(team.team_handicap, h.handicap_index) > 0}
                                  netHighlight={getNetHighlight(team.id, team.team_handicap, h)}
                                />
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
                                <ScoreCell
                                  key={h.hole_number}
                                  score={teamScores[h.hole_number]}
                                  par={h.par}
                                  receivesStroke={getStrokesReceived(team.team_handicap, h.handicap_index) > 0}
                                  netHighlight={getNetHighlight(team.id, team.team_handicap, h)}
                                />
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

                {/* Tiebreaker footer */}
                {isContestVerified && data?.tiebreaker_notes?.[team.id] && (
                  <div className={`px-3 py-2 border-t text-xs ${
                    isChampion ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-600"
                  }`}>
                    {data.tiebreaker_notes[team.id]}
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

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

function ScramblePayoutPanel({
  dayLabel,
  payout,
}: {
  dayLabel: string;
  payout: ScramblePayout;
}) {
  return (
    <div className="bg-lime-50 border border-lime-200 rounded-2xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-lime-800">
          {dayLabel} scramble payouts
        </h2>
        <span className="text-[0.625rem] text-lime-700 tabular-nums">
          {fmtMoney(payout.pot)} pot
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-lg border border-lime-100 px-3 py-2 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-gray-700">1st place</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">
            {fmtMoney(payout.first)}
          </span>
        </div>
        <div className="bg-white rounded-lg border border-lime-100 px-3 py-2 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-gray-700">2nd place</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">
            {fmtMoney(payout.second)}
          </span>
        </div>
      </div>
    </div>
  );
}
