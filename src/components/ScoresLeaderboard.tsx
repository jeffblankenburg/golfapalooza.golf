"use client";

import { useState } from "react";

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

interface TeeTimeGroup {
  id: string;
  tee_time: string | null;
  starting_hole: number | null;
  members: TeamMember[];
}

interface DayData {
  contest_id: string;
  name: string;
  day_number: number | null;
  contest_type: string;
  teams: Team[];
  teeTimeGroups: TeeTimeGroup[];
}

function getDayOfWeek(startDate: string, dayNumber: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + (dayNumber - 1));
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatTeeTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function calcPoints(team: Team): number | null {
  if (team.gross_score === null || team.gross_score === undefined) return null;
  return (team.course_par - team.gross_score) + team.team_handicap;
}

function rankTeams(teams: Team[]): (Team & { rank: number; points: number | null })[] {
  const withPoints = teams.map((t) => ({ ...t, points: calcPoints(t) }));

  // Sort: teams with scores first (by points desc), then teams without scores
  withPoints.sort((a, b) => {
    if (a.points !== null && b.points !== null) return b.points - a.points;
    if (a.points !== null) return -1;
    if (b.points !== null) return 1;
    return 0;
  });

  // Assign ranks (ties get same rank)
  let rank = 0;
  let lastPoints: number | null = null;
  return withPoints.map((team, i) => {
    if (team.points !== null) {
      if (team.points !== lastPoints) {
        rank = i + 1;
        lastPoints = team.points;
      }
    } else {
      rank = 0; // no rank for unscored teams
    }
    return { ...team, rank };
  });
}

export function ScoresLeaderboard({
  days,
  startDate,
}: {
  days: DayData[];
  startDate: string;
  currentUserId: string;
}) {
  // Default to the latest day that has any scores, or the first day
  const defaultDay = (() => {
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].teams.some((t) => t.gross_score !== null)) return i;
    }
    return 0;
  })();

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const currentDay = days[selectedDay];

  if (!currentDay) return null;

  const rankedTeams = rankTeams(currentDay.teams);
  const hasScores = rankedTeams.some((t) => t.points !== null);

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Scores</h1>

      {/* Day Tabs */}
      <div className="flex gap-1.5 mb-5 bg-gray-100 rounded-xl p-1">
        {days.map((day, index) => {
          const isActive = selectedDay === index;
          const dayLabel = day.day_number
            ? getDayOfWeek(startDate, day.day_number)
            : `Day ${index + 1}`;

          return (
            <button
              key={day.contest_id}
              onClick={() => setSelectedDay(index)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-gray-500 active:bg-gray-200"
              }`}
            >
              {dayLabel}
            </button>
          );
        })}
      </div>

      {/* Leaderboard */}
      {rankedTeams.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Teams not yet assigned for this day.</p>
        </div>
      ) : !hasScores ? (
        currentDay.teeTimeGroups.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-3">
              Tee Times — {currentDay.name}
            </p>
            {currentDay.teeTimeGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3"
              >
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
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {group.members.map((member, i) => (
                        <span key={i} className="text-sm text-gray-900">
                          {member.display_name}
                          {i < group.members.length - 1 && (
                            <span className="text-gray-300 ml-1">&middot;</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">Scores not yet posted.</p>
            <p className="text-xs mt-1">
              {rankedTeams.length} team{rankedTeams.length !== 1 ? "s" : ""} assigned
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {rankedTeams.map((team) => {
            const hasScore = team.points !== null;
            return (
              <div
                key={team.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="flex items-center px-4 py-3">
                  {/* Rank */}
                  <div className="w-8 flex-shrink-0">
                    {hasScore && team.rank > 0 ? (
                      <span
                        className={`text-lg font-bold ${
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
                      <span className="text-gray-200 text-lg">—</span>
                    )}
                  </div>

                  {/* Team members */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {team.members.map((member, i) => (
                        <span
                          key={i}
                          className="text-sm text-gray-900"
                        >
                          {member.display_name}
                          {i < team.members.length - 1 && (
                            <span className="text-gray-300 ml-1">·</span>
                          )}
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

                  {/* Points */}
                  <div className="flex-shrink-0 text-right ml-3">
                    {hasScore ? (
                      <div
                        className={`text-xl font-bold ${
                          team.points! >= 0 ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        {team.points! > 0 ? "+" : ""}
                        {team.points}
                      </div>
                    ) : (
                      <div className="text-xl font-bold text-gray-200">—</div>
                    )}
                    <div className="text-[10px] text-gray-400 uppercase">pts</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
