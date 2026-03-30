"use client";

import { useState } from "react";

interface ContestItem {
  id: string;
  name: string;
  contestType: string;
  dayNumber: number | null;
  participantCount: number;
  isParticipating: boolean;
}

interface ScrambleTeam {
  id: string;
  team_handicap: number;
  gross_score: number | null;
  course_par: number;
  members: { display_name: string; avatar_url: string | null }[];
}

interface RyderData {
  teams: { id: string; team_number: number; team_name: string }[];
  pairs: { id: string; team_id: string; player_a: string; player_b: string }[];
  foursomes: { id: string; pair_a_id: string; pair_b_id: string; foursome_number: number }[];
}

interface TeeTimeGroup {
  id: string;
  tee_time: string | null;
  starting_hole: number | null;
  members: { display_name: string; avatar_url: string | null }[];
}

interface ContestDetailData {
  scrambleTeams?: ScrambleTeam[];
  ryderData?: RyderData;
  teeTimeGroups?: TeeTimeGroup[];
  participants?: { display_name: string; avatar_url: string | null }[];
}

const contestTypeLabels: Record<string, string> = {
  ryder_cup: "Ryder Cup",
  kgb_cup: "Ryder Cup",
  scramble: "Scramble",
  cornhole_singles: "Cornhole",
  cornhole_doubles: "Cornhole",
  calcutta: "Calcutta",
  other: "Contest",
};

const contestTypeColors: Record<string, string> = {
  ryder_cup: "bg-red-50 text-red-700",
  kgb_cup: "bg-red-50 text-red-700",
  scramble: "bg-green-50 text-green-700",
  cornhole_singles: "bg-orange-50 text-orange-700",
  cornhole_doubles: "bg-orange-50 text-orange-700",
  calcutta: "bg-purple-50 text-purple-700",
  other: "bg-gray-50 text-gray-700",
};

const contestTypeIcons: Record<string, React.ReactNode> = {
  ryder_cup: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  ),
  scramble: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  cornhole_singles: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  calcutta: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const defaultIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

function getIcon(contestType: string) {
  return contestTypeIcons[contestType] || defaultIcon;
}

function humanizeContestType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDayLabel(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatTeeTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function calcPoints(team: ScrambleTeam): number | null {
  if (team.gross_score === null || team.gross_score === undefined) return null;
  return (team.course_par - team.gross_score) + team.team_handicap;
}

function rankTeams(teams: ScrambleTeam[]): (ScrambleTeam & { rank: number; points: number | null })[] {
  const withPoints = teams.map((t) => ({ ...t, points: calcPoints(t) }));

  withPoints.sort((a, b) => {
    if (a.points !== null && b.points !== null) return b.points - a.points;
    if (a.points !== null) return -1;
    if (b.points !== null) return 1;
    return 0;
  });

  let rank = 0;
  let lastPoints: number | null = null;
  return withPoints.map((team, i) => {
    if (team.points !== null) {
      if (team.points !== lastPoints) {
        rank = i + 1;
        lastPoints = team.points;
      }
    } else {
      rank = 0;
    }
    return { ...team, rank };
  });
}

// --- Expanded content renderers ---

function ScrambleContent({
  detail,
  showTeams,
}: {
  detail: ContestDetailData;
  showTeams: boolean;
}) {
  if (!showTeams) {
    return <p className="text-sm text-gray-400 py-3">Teams and scores coming soon!</p>;
  }

  const teams = detail.scrambleTeams || [];
  const teeTimeGroups = detail.teeTimeGroups || [];
  const hasScores = teams.some((t) => t.gross_score !== null);

  if (hasScores) {
    const ranked = rankTeams(teams);
    return (
      <div className="space-y-2 py-3">
        {ranked.map((team) => {
          const hasScore = team.points !== null;
          return (
            <div key={team.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="flex items-center">
                <div className="w-7 flex-shrink-0">
                  {hasScore && team.rank > 0 ? (
                    <span
                      className={`text-base font-bold ${
                        team.rank === 1
                          ? "text-yellow-500"
                          : team.rank === 2
                          ? "text-gray-400"
                          : team.rank === 3
                          ? "text-amber-600"
                          : "text-gray-300"
                      }`}
                    >
                      {team.rank}
                    </span>
                  ) : (
                    <span className="text-gray-200 text-base">—</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1 items-center">
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
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">
                      HC: {team.team_handicap >= 0 ? "+" : ""}{team.team_handicap}
                    </span>
                    {hasScore && (
                      <span className="text-xs text-gray-400">
                        Gross: {team.gross_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right ml-3">
                  {hasScore ? (
                    <div
                      className={`text-lg font-bold ${
                        team.points! >= 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {team.points! > 0 ? "+" : ""}
                      {team.points}
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-gray-200">—</div>
                  )}
                  <div className="text-[10px] text-gray-400 uppercase">pts</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // No scores — show tee times if available
  if (teeTimeGroups.length > 0) {
    return (
      <div className="space-y-2 py-3">
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">
          Tee Times
        </p>
        {teeTimeGroups.map((group) => (
          <div key={group.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-16 pt-0.5">
                {group.tee_time ? (
                  <p className="text-sm font-semibold text-green-700">
                    {formatTeeTime(group.tee_time)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-300">TBD</p>
                )}
                {group.starting_hole && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Hole {group.starting_hole}
                  </p>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1 items-center">
                  {group.members.map((m, i) => (
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
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // No scores, no tee times — show team rosters
  if (teams.length > 0) {
    return (
      <div className="space-y-2 py-3">
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">
          Teams
        </p>
        {teams.map((team) => (
          <div key={team.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex flex-wrap gap-1 items-center">
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
            <span className="text-xs text-gray-400">
              HC: {team.team_handicap >= 0 ? "+" : ""}{team.team_handicap}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-gray-400 py-3">Teams coming soon!</p>;
}

function RyderCupContent({
  detail,
  showTeams,
}: {
  detail: ContestDetailData;
  showTeams: boolean;
}) {
  if (!showTeams) {
    return <p className="text-sm text-gray-400 py-3">Teams coming soon!</p>;
  }

  const ryder = detail.ryderData;
  if (!ryder || ryder.teams.length === 0) {
    return <p className="text-sm text-gray-400 py-3">Teams coming soon!</p>;
  }

  // Sort teams by team_number
  const sortedTeams = [...ryder.teams].sort((a, b) => a.team_number - b.team_number);

  return (
    <div className="py-3 space-y-4">
      {/* Teams side by side */}
      <div className="grid grid-cols-2 gap-3">
        {sortedTeams.map((team) => {
          const teamPairs = ryder.pairs.filter((p) => p.team_id === team.id);
          return (
            <div key={team.id} className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-bold text-gray-900 mb-2">{team.team_name}</p>
              {teamPairs.length > 0 ? (
                <div className="space-y-1.5">
                  {teamPairs.map((pair) => (
                    <p key={pair.id} className="text-xs text-gray-600">
                      {pair.player_a} &amp; {pair.player_b}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Pairs TBD</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Foursomes matchups */}
      {ryder.foursomes.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">
            Foursomes
          </p>
          <div className="space-y-2">
            {ryder.foursomes
              .sort((a, b) => a.foursome_number - b.foursome_number)
              .map((f) => {
                const pairA = ryder.pairs.find((p) => p.id === f.pair_a_id);
                const pairB = ryder.pairs.find((p) => p.id === f.pair_b_id);
                return (
                  <div key={f.id} className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm">
                    <span className="text-gray-900">
                      {pairA ? `${pairA.player_a} & ${pairA.player_b}` : "TBD"}
                    </span>
                    <span className="text-gray-400 mx-2">vs</span>
                    <span className="text-gray-900">
                      {pairB ? `${pairB.player_a} & ${pairB.player_b}` : "TBD"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipantListContent({ detail }: { detail: ContestDetailData }) {
  const participants = detail.participants || [];
  if (participants.length === 0) {
    return <p className="text-sm text-gray-400 py-3">No participants yet.</p>;
  }

  return (
    <div className="py-3">
      <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">
        Participants
      </p>
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-sm"
          >
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                {(p.display_name || "?")[0].toUpperCase()}
              </span>
            )}
            {p.display_name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExpandedContent({
  contest,
  detail,
  showTeams,
}: {
  contest: ContestItem;
  detail: ContestDetailData;
  showTeams: boolean;
}) {
  switch (contest.contestType) {
    case "scramble":
      return <ScrambleContent detail={detail} showTeams={showTeams} />;
    case "ryder_cup":
    case "kgb_cup":
      return <RyderCupContent detail={detail} showTeams={showTeams} />;
    case "cornhole_singles":
    case "cornhole_doubles":
    case "calcutta":
    default:
      return <ParticipantListContent detail={detail} />;
  }
}

export function ContestList({
  contests,
  startDate,
  showTeams,
  detailData,
}: {
  contests: ContestItem[];
  startDate: string;
  showTeams: boolean;
  detailData: Record<string, ContestDetailData>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (contests.length === 0) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Contests</h1>
        <p className="text-gray-500 text-center py-8">
          No contests have been set up yet.
        </p>
      </div>
    );
  }

  // Group by day_number (null = "Other")
  const dayGroups: Record<string, ContestItem[]> = {};
  for (const c of contests) {
    const key = c.dayNumber !== null ? String(c.dayNumber) : "other";
    if (!dayGroups[key]) dayGroups[key] = [];
    dayGroups[key].push(c);
  }

  const sortedKeys = Object.keys(dayGroups).sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return Number(a) - Number(b);
  });

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Contests</h1>

      {sortedKeys.map((key) => {
        const group = dayGroups[key];
        const dayNum = key !== "other" ? Number(key) : null;
        const heading =
          dayNum !== null
            ? `Day ${dayNum} — ${getDayLabel(startDate, dayNum)}`
            : "Other Contests";

        return (
          <div key={key} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {heading}
            </h2>

            {group.map((contest) => {
              const colors =
                contestTypeColors[contest.contestType] || contestTypeColors.other;
              const typeLabel =
                contestTypeLabels[contest.contestType] || humanizeContestType(contest.contestType);
              const isExpanded = expandedId === contest.id;
              const detail = detailData[contest.id] || {};

              return (
                <div
                  key={contest.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : contest.id)
                    }
                    className="flex items-center gap-4 p-4 w-full text-left active:bg-gray-50 transition-colors"
                  >
                    <div
                      className={`flex items-center justify-center w-12 h-12 rounded-full ${colors} flex-shrink-0`}
                    >
                      {getIcon(contest.contestType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {contest.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors}`}
                        >
                          {typeLabel}
                        </span>
                        <span className="text-xs text-gray-400">
                          {contest.participantCount} player{contest.participantCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    {contest.isParticipating && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4">
                      <ExpandedContent
                        contest={contest}
                        detail={detail}
                        showTeams={showTeams}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
