"use client";

import { useState } from "react";
import {
  formatMatchStatus,
  type FoursomeResult,
  type MatchResult,
  type OverallResult,
} from "@/lib/kgb-cup/match-logic";

// ── Types ──

export interface KgbTeamInfo {
  team_number: number;
  team_name: string;
  team_color: string | null;
}

export interface KgbGroupData {
  id: string;
  sort_order: number;
  team1PairLabel: string;
  team2PairLabel: string;
  results: FoursomeResult;
}

// ── Scoreboard Hero ──

export function KgbCupScoreboard({
  team1,
  team2,
  overall,
  verified,
  children,
}: {
  team1: KgbTeamInfo;
  team2: KgbTeamInfo;
  overall: OverallResult;
  verified?: boolean;
  children?: React.ReactNode;
}) {
  const t1Color = team1.team_color || "#3b82f6";
  const t2Color = team2.team_color || "#ef4444";
  const maxPoints = overall.totalSections;
  const clinch = Math.ceil(maxPoints / 2);
  const team1Pct = maxPoints > 0 ? (overall.team1Points / maxPoints) * 100 : 0;
  const team2Pct = maxPoints > 0 ? (overall.team2Points / maxPoints) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      {children}

      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-sm font-bold mb-1" style={{ color: t1Color }}>{team1.team_name}</p>
          <p className="text-4xl font-black" style={{ color: t1Color }}>{overall.team1Points}</p>
        </div>
        <div className="text-2xl text-gray-200 font-light">vs</div>
        <div className="text-center">
          <p className="text-sm font-bold mb-1" style={{ color: t2Color }}>{team2.team_name}</p>
          <p className="text-4xl font-black" style={{ color: t2Color }}>{overall.team2Points}</p>
        </div>
      </div>

      {/* Tug-of-war progress bar */}
      <div className="mt-4 relative">
        <div className="relative h-4 rounded-full overflow-hidden bg-gray-200">
          <div
            className="absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-l-full"
            style={{ width: `${team1Pct}%`, backgroundColor: t1Color }}
          />
          <div
            className="absolute right-0 top-0 h-full transition-all duration-700 ease-out rounded-r-full"
            style={{ width: `${team2Pct}%`, backgroundColor: t2Color }}
          />
        </div>
        {maxPoints > 0 && (
          <div
            className="absolute top-0 h-4 w-0.5 bg-yellow-400"
            style={{ left: "50%" }}
            title={`First to ${clinch}`}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.5625rem] text-yellow-600 font-bold whitespace-nowrap">{clinch}</span>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        {overall.completedSections} of {overall.totalSections} matches complete
        {overall.winner === "team1" && (
          <span className="font-bold" style={{ color: t1Color }}> — {team1.team_name} wins!</span>
        )}
        {overall.winner === "team2" && (
          <span className="font-bold" style={{ color: t2Color }}> — {team2.team_name} wins!</span>
        )}
        {overall.winner === "tied" && (
          <span className="font-bold text-gray-600"> — Tied!</span>
        )}
      </p>

      {verified && (
        <span className="inline-flex items-center gap-0.5 mt-2 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[0.625rem] font-semibold">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
          Official
        </span>
      )}
    </div>
  );
}

// ── Group Results List ──

export function KgbCupGroupResults({
  groups,
  team1Color,
  team2Color,
}: {
  groups: KgbGroupData[];
  team1Color: string;
  team2Color: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Group Results
      </h2>
      {groups.map((g, i) => (
        <GroupCard
          key={g.id}
          groupNum={i + 1}
          group={g}
          team1Color={team1Color}
          team2Color={team2Color}
        />
      ))}
    </div>
  );
}

// ── Group Card ──

function GroupCard({
  groupNum,
  group,
  team1Color,
  team2Color,
}: {
  groupNum: number;
  group: KgbGroupData;
  team1Color: string;
  team2Color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { results } = group;

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
            <span className="font-medium truncate" style={{ color: team1Color }}>{group.team1PairLabel}</span>
            <span className="text-gray-300">vs</span>
            <span className="font-medium truncate" style={{ color: team2Color }}>{group.team2PairLabel}</span>
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
          {sectionsFromMatches(results.matches).map(({ section, sectionMatches, firstHole, lastHole, isScramble }) => {
            const sectionLabel = isScramble ? `Section ${section} — Scramble` : `Section ${section} — Individual`;
            return (
              <div key={section}>
                <div className="px-4 py-1.5 bg-gray-50">
                  <p className="text-[0.625rem] font-semibold text-gray-400 uppercase tracking-wide">
                    {sectionLabel} (Holes {firstHole}-{lastHole})
                  </p>
                </div>
                {sectionMatches.map((m) => (
                  <MatchRow
                    key={m.matchIndex}
                    match={m}
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

// Group MatchResults by section number, deriving the hole range and scramble
// flag from the match data itself. Handles 2v2 (3 sections, §3 scramble),
// 1v2 (2 sections × 9 holes), 2v3/3v3 (3 sections × 6 holes, all individual).
function sectionsFromMatches(matches: MatchResult[]): {
  section: 1 | 2 | 3;
  sectionMatches: MatchResult[];
  firstHole: number;
  lastHole: number;
  isScramble: boolean;
}[] {
  const buckets = new Map<1 | 2 | 3, MatchResult[]>();
  for (const m of matches) {
    if (!buckets.has(m.section)) buckets.set(m.section, []);
    buckets.get(m.section)!.push(m);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([section, sectionMatches]) => {
      const allHoles = sectionMatches.flatMap((m) => m.holeResults.map((hr) => hr.hole));
      return {
        section,
        sectionMatches,
        firstHole: allHoles.length > 0 ? Math.min(...allHoles) : 0,
        lastHole: allHoles.length > 0 ? Math.max(...allHoles) : 0,
        isScramble: sectionMatches.some((m) => m.scorerType === "pair"),
      };
    });
}

// ── Match Row ──

function MatchRow({
  match,
  team1Color,
  team2Color,
}: {
  match: MatchResult;
  team1Color: string;
  team2Color: string;
}) {
  const statusText = formatMatchStatus(match);

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
    undefined;

  const rowBg =
    match.sectionWinner === "team1" || match.sectionWinner === "team2"
      ? { backgroundColor: `${statusColor}20` }
      : undefined;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0"
      style={rowBg}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700">{match.label}</p>
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
          <p className="text-[0.625rem] text-gray-400 mt-0.5">
            {match.team1Points} - {match.team2Points} pts
          </p>
        )}
      </div>
    </div>
  );
}
