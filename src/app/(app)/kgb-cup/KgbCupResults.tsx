"use client";

import { useState, useEffect } from "react";

import {
  formatMatchStatus,
  type FoursomeResult,
  type MatchResult,
  type OverallResult,
} from "@/lib/kgb-cup/match-logic";

interface TeamInfo {
  id: string;
  team_number: number;
  team_name: string;
  team_color: string | null;
}

interface PairData {
  id: string;
  player_a: string;
  player_b: string;
}

interface EnrichedFoursome {
  id: string;
  sort_order: number;
  team1_pair: PairData | null;
  team2_pair: PairData | null;
  results: FoursomeResult;
}

interface ResultsData {
  teams: TeamInfo[];
  foursomes: EnrichedFoursome[];
  overall: OverallResult;
  verified?: boolean;
}

export function KgbCupResults({ contestId }: { contestId: string }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch(`/api/kgb-cup/results?contest_id=${contestId}`);
        if (!res.ok) {
          setError("Failed to load results");
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [contestId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>
        <p className="text-gray-500 text-center py-8">{error || "No data available."}</p>
      </div>
    );
  }

  const { teams, foursomes, overall } = data;
  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);
  const team1Color = team1?.team_color || "#3b82f6";
  const team2Color = team2?.team_color || "#ef4444";
  const maxPoints = overall.totalSections;
  const clinch = Math.ceil(maxPoints / 2);
  const team1Pct = maxPoints > 0 ? (overall.team1Points / maxPoints) * 100 : 0;
  const team2Pct = maxPoints > 0 ? (overall.team2Points / maxPoints) * 100 : 0;

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      {/* Hero Scoreboard */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <h1 className="text-lg font-bold text-gray-900">KGB Cup</h1>
          {data.verified && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Official
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-sm font-bold mb-1" style={{ color: team1Color }}>{team1?.team_name || "Team 1"}</p>
            <p className="text-4xl font-black" style={{ color: team1Color }}>{overall.team1Points}</p>
          </div>
          <div className="text-2xl text-gray-200 font-light">vs</div>
          <div className="text-center">
            <p className="text-sm font-bold mb-1" style={{ color: team2Color }}>{team2?.team_name || "Team 2"}</p>
            <p className="text-4xl font-black" style={{ color: team2Color }}>{overall.team2Points}</p>
          </div>
        </div>

        {/* Tug-of-war progress bar */}
        <div className="mt-4 relative">
          <div className="relative h-4 rounded-full overflow-hidden bg-gray-200">
            <div
              className="absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-l-full"
              style={{ width: `${team1Pct}%`, backgroundColor: team1Color }}
            />
            <div
              className="absolute right-0 top-0 h-full transition-all duration-700 ease-out rounded-r-full"
              style={{ width: `${team2Pct}%`, backgroundColor: team2Color }}
            />
          </div>
          {/* Clinch marker */}
          {maxPoints > 0 && (
            <div
              className="absolute top-0 h-4 w-0.5 bg-yellow-400"
              style={{ left: "50%" }}
              title={`First to ${clinch}`}
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-yellow-600 font-bold whitespace-nowrap">{clinch}</span>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          {overall.completedSections} of {overall.totalSections} matches complete
          {overall.winner === "team1" && (
            <span className="font-bold" style={{ color: team1Color }}> — {team1?.team_name || "Team 1"} wins!</span>
          )}
          {overall.winner === "team2" && (
            <span className="font-bold" style={{ color: team2Color }}> — {team2?.team_name || "Team 2"} wins!</span>
          )}
          {overall.winner === "tied" && (
            <span className="font-bold text-gray-600"> — Tied!</span>
          )}
        </p>
      </div>

      {/* Group Results */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Group Results
        </h2>

        {foursomes.map((f, i) => (
          <GroupCard
            key={f.id}
            groupNum={i + 1}
            foursome={f}
            team1Name={team1?.team_name || "Team 1"}
            team2Name={team2?.team_name || "Team 2"}
            team1Color={team1Color}
            team2Color={team2Color}
          />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  groupNum,
  foursome,
  team1Name,
  team2Name,
  team1Color,
  team2Color,
}: {
  groupNum: number;
  foursome: EnrichedFoursome;
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { results } = foursome;

  const pair1Label = foursome.team1_pair
    ? [foursome.team1_pair.player_a, foursome.team1_pair.player_b].filter(Boolean).join(" & ")
    : "TBD";
  const pair2Label = foursome.team2_pair
    ? [foursome.team2_pair.player_a, foursome.team2_pair.player_b].filter(Boolean).join(" & ")
    : "TBD";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex-shrink-0">
          {groupNum}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium truncate" style={{ color: team1Color }}>{pair1Label}</span>
            <span className="text-gray-300">vs</span>
            <span className="font-medium truncate" style={{ color: team2Color }}>{pair2Label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold">
            <span style={{ color: team1Color }}>{results.team1TotalPoints}</span>
            <span className="text-gray-300"> - </span>
            <span style={{ color: team2Color }}>{results.team2TotalPoints}</span>
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Section results */}
          {[1, 2, 3].map((section) => {
            const sectionMatches = results.matches.filter((m) => m.section === section);
            const sectionLabel = section === 3 ? "Section 3 — Scramble" : `Section ${section} — Individual`;
            return (
              <div key={section}>
                <div className="px-4 py-1.5 bg-gray-50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {sectionLabel} (Holes {(section - 1) * 6 + 1}-{section * 6})
                  </p>
                </div>
                {sectionMatches.map((m) => (
                  <MatchRow
                    key={m.matchIndex}
                    match={m}
                    team1Name={team1Name}
                    team2Name={team2Name}
                    team1Color={team1Color}
                    team2Color={team2Color}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match,
  team1Name,
  team2Name,
  team1Color,
  team2Color,
}: {
  match: MatchResult;
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
}) {
  const statusText = formatMatchStatus(match)
    .replace("T1", team1Name.length > 10 ? team1Name.slice(0, 8) + ".." : team1Name)
    .replace("T2", team2Name.length > 10 ? team2Name.slice(0, 8) + ".." : team2Name);

  const dotStyle = (winner: string | null): React.CSSProperties => {
    if (winner === "team1") return { backgroundColor: team1Color };
    if (winner === "team2") return { backgroundColor: team2Color };
    return {};
  };

  const dotClass = (winner: string | null) => {
    if (winner === "tie") return "bg-gray-300";
    if (winner === null) return "bg-gray-100";
    return "";
  };

  const statusColor =
    match.sectionWinner === "team1" ? team1Color :
    match.sectionWinner === "team2" ? team2Color :
    match.sectionWinner === "halved" ? undefined :
    undefined;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700">{match.label}</p>
        {/* Hole-by-hole dots */}
        <div className="flex gap-1 mt-1">
          {match.holeResults.map((hr) => (
            <span
              key={hr.hole}
              className={`w-2.5 h-2.5 rounded-full ${dotClass(hr.winner)}`}
              style={dotStyle(hr.winner)}
              title={`Hole ${hr.hole}: ${hr.winner || "unscored"}`}
            />
          ))}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p
          className={`text-xs font-semibold ${
            match.sectionWinner === "halved" ? "text-gray-500" :
            match.sectionWinner === "incomplete" ? "text-gray-400" : ""
          }`}
          style={statusColor ? { color: statusColor } : undefined}
        >
          {statusText}
        </p>
        {match.sectionWinner !== "incomplete" && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {match.team1Points} - {match.team2Points} pts
          </p>
        )}
      </div>
    </div>
  );
}
