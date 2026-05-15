"use client";

import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/components/ActivityTracker";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import {
  formatMatchStatus,
  type FoursomeResult,
  type MatchResult,
  type OverallResult,
} from "@/lib/kgb-cup/match-logic";
import { kgbCupMatchSchedule, type KgbScheduledSection } from "@/lib/kgb-cup/schedule";
import { KgbCupScoreboard, KgbCupGroupResults } from "@/components/kgb-cup/KgbCupResultsView";
import { DragHandle } from "@/components/DragHandle";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface PlayerInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamColor: string | null;
}

interface PairInfo {
  id: string;
  teamId: string;
  players: PlayerInfo[];
}

interface ScoreEntry {
  foursome_id: string;
  hole_number: number;
  scorer_type: string;
  scorer_id: string;
  strokes: number;
}

interface Props {
  foursomeId: string;
  contestId: string;
  pairs: PairInfo[];
  startingHole: number;
  holes: HoleInfo[];
  initialScores: ScoreEntry[];
  playerHandicaps: { playerId: string; adjustedHandicap: number }[];
  pairHandicaps: { pairId: string; scrambleHandicap: number }[];
  scoringClosed?: boolean;
  contestVerified?: boolean;
}

function getScorerKey(scorerType: string, scorerId: string, holeNumber: number): string {
  return `${scorerType}-${scorerId}-${holeNumber}`;
}

/**
 * Strokes received on a hole using 18-hole distribution.
 * Strokes go to the hardest holes first (handicap_index 1 = hardest).
 */
function getStrokesOnHole(
  adjustedHandicap: number,
  holeHandicapIndex: number,
  totalHoles: number = 18
): number {
  if (adjustedHandicap <= 0) return 0;
  const fullPasses = Math.floor(adjustedHandicap / totalHoles);
  const remainder = adjustedHandicap % totalHoles;
  return fullPasses + (holeHandicapIndex <= remainder ? 1 : 0);
}

function scoreColorClass(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-300";
  if (strokes < par) return "text-green-700";
  if (strokes > par) return "text-red-600";
  return "text-gray-900";
}

interface MatchDisplaySide {
  type: "player" | "pair";
  id: string;
  label: string;
  teamColor: string | null;
  handicap: number;
  strokes: number;
  score: number | undefined;
}

interface MatchDisplay {
  team1: MatchDisplaySide;
  team2: MatchDisplaySide;
  winner: "team1" | "team2" | "tie" | null;
}

// ── KGB Cup Leaderboard Popup ────────────────────────────────────────────

interface LeaderboardTeamInfo {
  id: string;
  team_number: number;
  team_name: string;
  team_color: string | null;
}

interface LeaderboardPairData {
  id: string;
  player_a: string;
  player_b: string;
  player_c: string;
}

interface LeaderboardFoursome {
  id: string;
  sort_order: number;
  team1_pair: LeaderboardPairData | null;
  team2_pair: LeaderboardPairData | null;
  results: FoursomeResult;
}

interface LeaderboardData {
  teams: LeaderboardTeamInfo[];
  foursomes: LeaderboardFoursome[];
  overall: OverallResult;
}

function KgbCupLeaderboardPopup({
  contestId,
  onClose,
}: {
  contestId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/kgb-cup/results?contest_id=${contestId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 30000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  if (loading || !data) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-6 animate-slide-up">
          <DragHandle onClose={onClose} className="mb-4" />
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const { teams, foursomes, overall } = data;
  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);
  const t1Color = team1?.team_color || "#3b82f6";
  const t2Color = team2?.team_color || "#ef4444";
  const maxPoints = overall.totalSections;
  const clinch = Math.ceil(maxPoints / 2);
  const t1Pct = maxPoints > 0 ? (overall.team1Points / maxPoints) * 100 : 0;
  const t2Pct = maxPoints > 0 ? (overall.team2Points / maxPoints) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-6 animate-slide-up max-h-[80vh] overflow-y-auto">
        <DragHandle onClose={onClose} className="mb-4" />

        <KgbCupScoreboard
          team1={{ team_number: 1, team_name: team1?.team_name || "Team 1", team_color: t1Color }}
          team2={{ team_number: 2, team_name: team2?.team_name || "Team 2", team_color: t2Color }}
          overall={overall}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">KGB Cup</h2>
        </KgbCupScoreboard>

        <div className="mt-4">
          <KgbCupGroupResults
            groups={foursomes.map((f) => ({
              id: f.id,
              sort_order: f.sort_order,
              team1PairLabel: f.team1_pair
                ? [f.team1_pair.player_a, f.team1_pair.player_b, f.team1_pair.player_c].filter(Boolean).join(" & ")
                : "",
              team2PairLabel: f.team2_pair
                ? [f.team2_pair.player_a, f.team2_pair.player_b, f.team2_pair.player_c].filter(Boolean).join(" & ")
                : "",
              results: f.results,
            }))}
            team1Color={t1Color}
            team2Color={t2Color}
          />
        </div>
      </div>
    </div>
  );
}

// ── KgbCupLiveScorer ─────────────────────────────────────────────────────

export function KgbCupLiveScorer({
  foursomeId,
  contestId,
  pairs,
  startingHole,
  holes,
  initialScores,
  playerHandicaps,
  pairHandicaps,
  scoringClosed = false,
  contestVerified = false,
}: Props) {
  const router = useRouter();
  const isLocked = scoringClosed || contestVerified;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Track current hole via ref so score handlers always access the current hole without re-renders
  const currentHoleRef = useRef<HoleInfo>(
    holes[Math.max(0, holes.findIndex((h) => h.hole_number === startingHole))]
  );

  // Scores: composite key -> strokes
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const s of initialScores) {
      map[getScorerKey(s.scorer_type, s.scorer_id, s.hole_number)] = s.strokes;
    }
    return map;
  });

  // Dirty tracking
  const dirtyRef = useRef<Map<string, ScoreEntry>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable height for match panel
  const matchPanelRef = useRef<HTMLDivElement>(null);
  const [matchPanelHeight, setMatchPanelHeight] = useState(0);

  // Handicap maps
  const playerHcMap = new Map<string, number>();
  for (const h of playerHandicaps) playerHcMap.set(h.playerId, h.adjustedHandicap);
  const pairHcMap = new Map<string, number>();
  for (const h of pairHandicaps) pairHcMap.set(h.pairId, h.scrambleHandicap);

  const team1Color = pairs[0]?.players[0]?.teamColor || "#3b82f6";
  const team2Color = pairs[1]?.players[0]?.teamColor || "#ef4444";

  // Build the canonical match schedule once for the foursome (or 3some/5some/6some).
  // Schedule shape varies by group size — see src/lib/kgb-cup/schedule.ts.
  const team1Players = useMemo(() => pairs[0]?.players || [], [pairs]);
  const team2Players = useMemo(() => pairs[1]?.players || [], [pairs]);
  const schedule = useMemo(() => {
    if (team1Players.length === 0 || team2Players.length === 0) return null;
    try {
      return kgbCupMatchSchedule(
        team1Players.map((p) => ({ id: p.id, displayName: p.displayName })),
        team2Players.map((p) => ({ id: p.id, displayName: p.displayName })),
      );
    } catch {
      return null;
    }
  }, [team1Players, team2Players]);

  const playerLookup = useMemo(() => {
    const m = new Map<string, PlayerInfo>();
    for (const p of team1Players) m.set(p.id, p);
    for (const p of team2Players) m.set(p.id, p);
    return m;
  }, [team1Players, team2Players]);

  const getHoleHandicapIndex = (holeNum: number): number => {
    return holes.find((h) => h.hole_number === holeNum)?.handicap_index || 0;
  };

  const sectionForHole = (holeNum: number): KgbScheduledSection | null => {
    if (!schedule) return null;
    return schedule.sections.find((s) => s.holes.includes(holeNum)) ?? null;
  };

  const getSection = (holeNum: number): 1 | 2 | 3 => sectionForHole(holeNum)?.section ?? 1;

  // Track max height of the match panel so it stays stable when switching sections
  useEffect(() => {
    if (matchPanelRef.current) {
      const h = matchPanelRef.current.scrollHeight;
      setMatchPanelHeight((prev) => Math.max(prev, h));
    }
  });

  // ── Save Logic ──

  const flushSaves = useCallback(async () => {
    const toSave = Array.from(dirtyRef.current.values());
    if (toSave.length === 0) return;
    dirtyRef.current.clear();
    setSaveStatus("saving");
    try {
      const results = await Promise.all(
        toSave.map((s) =>
          fetch("/api/kgb-cup/score", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              foursome_id: s.foursome_id,
              hole_number: s.hole_number,
              scorer_type: s.scorer_type,
              scorer_id: s.scorer_id,
              strokes: s.strokes,
            }),
          })
        )
      );
      if (results.every((r) => r.ok)) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        logActivity("score_save", "/kgb-cup/scoring", {
          foursome_id: toSave[0]?.foursome_id,
          holes: toSave.map((s) => s.hole_number),
        });
      } else {
        setSaveStatus("error");
        for (const s of toSave) dirtyRef.current.set(getScorerKey(s.scorer_type, s.scorer_id, s.hole_number), s);
      }
    } catch {
      setSaveStatus("error");
      for (const s of toSave) dirtyRef.current.set(getScorerKey(s.scorer_type, s.scorer_id, s.hole_number), s);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 600);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirty = dirtyRef;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      for (const s of Array.from(dirty.current.values())) {
        fetch("/api/kgb-cup/score", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            foursome_id: s.foursome_id, hole_number: s.hole_number,
            scorer_type: s.scorer_type, scorer_id: s.scorer_id, strokes: s.strokes,
          }),
        });
      }
    };
  }, []);

  // ── Score Handlers ──

  const handleIncrement = (scorerType: "player" | "pair", scorerId: string) => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;
    const par = currentHoleRef.current.par;
    const key = getScorerKey(scorerType, scorerId, holeNum);
    const current = scores[key];
    const newVal = current !== undefined ? Math.min(current + 1, 20) : par;
    setScores((prev) => ({ ...prev, [key]: newVal }));
    dirtyRef.current.set(key, { foursome_id: foursomeId, hole_number: holeNum, scorer_type: scorerType, scorer_id: scorerId, strokes: newVal });
    scheduleSave();
  };

  const handleDecrement = (scorerType: "player" | "pair", scorerId: string) => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;
    const par = currentHoleRef.current.par;
    const key = getScorerKey(scorerType, scorerId, holeNum);
    const current = scores[key];
    if (current !== undefined && current <= 1) return;
    const newVal = current !== undefined ? current - 1 : Math.max(par - 1, 1);
    setScores((prev) => ({ ...prev, [key]: newVal }));
    dirtyRef.current.set(key, { foursome_id: foursomeId, hole_number: holeNum, scorer_type: scorerType, scorer_id: scorerId, strokes: newVal });
    scheduleSave();
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDecrementStart = (scorerType: "player" | "pair", scorerId: string) => {
    if (isLocked) return;
    longPressTimer.current = setTimeout(() => {
      const holeNum = currentHoleRef.current.hole_number;
      const key = getScorerKey(scorerType, scorerId, holeNum);
      setScores((prev) => { const next = { ...prev }; delete next[key]; return next; });
      dirtyRef.current.delete(key);
    }, 800);
  };
  const handleDecrementEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Match Logic ──

  const getMatchesForDisplay = (holeNum: number): MatchDisplay[] => {
    const sec = sectionForHole(holeNum);
    if (!sec) return [];
    const hdcpIdx = getHoleHandicapIndex(holeNum);

    return sec.matches
      .map((m): MatchDisplay | null => {
        if (sec.format === "scramble") {
          const p1 = pairs[0];
          const p2 = pairs[1];
          if (!p1 || !p2) return null;
          const t1Hc = pairHcMap.get(p1.id) || 0;
          const t2Hc = pairHcMap.get(p2.id) || 0;
          const diffHc = Math.abs(t1Hc - t2Hc);
          const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
          const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
          const t1Score = scores[getScorerKey("pair", p1.id, holeNum)];
          const t2Score = scores[getScorerKey("pair", p2.id, holeNum)];

          let winner: "team1" | "team2" | "tie" | null = null;
          if (t1Score !== undefined && t2Score !== undefined) {
            const t1Net = t1Score - t1Strokes;
            const t2Net = t2Score - t2Strokes;
            if (t1Net < t2Net) winner = "team1";
            else if (t2Net < t1Net) winner = "team2";
            else winner = "tie";
          }

          return {
            team1: {
              type: "pair", id: p1.id,
              label: p1.players.map((p) => p.displayName).join(" & "),
              teamColor: p1.players[0]?.teamColor || null, handicap: t1Hc, strokes: t1Strokes, score: t1Score,
            },
            team2: {
              type: "pair", id: p2.id,
              label: p2.players.map((p) => p.displayName).join(" & "),
              teamColor: p2.players[0]?.teamColor || null, handicap: t2Hc, strokes: t2Strokes, score: t2Score,
            },
            winner,
          };
        }

        // Individual match — resolve players from the schedule.
        const p1 = playerLookup.get(m.team1Player.id);
        const p2 = playerLookup.get(m.team2Player.id);
        if (!p1 || !p2) return null;

        const t1Hc = playerHcMap.get(p1.id) || 0;
        const t2Hc = playerHcMap.get(p2.id) || 0;
        const diffHc = Math.abs(t1Hc - t2Hc);
        const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
        const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
        const t1Score = scores[getScorerKey("player", p1.id, holeNum)];
        const t2Score = scores[getScorerKey("player", p2.id, holeNum)];

        let winner: "team1" | "team2" | "tie" | null = null;
        if (t1Score !== undefined && t2Score !== undefined) {
          const t1Net = t1Score - t1Strokes;
          const t2Net = t2Score - t2Strokes;
          if (t1Net < t2Net) winner = "team1";
          else if (t2Net < t1Net) winner = "team2";
          else winner = "tie";
        }

        return {
          team1: {
            type: "player" as const, id: p1.id,
            label: p1.displayName,
            teamColor: p1.teamColor, handicap: t1Hc, strokes: t1Strokes, score: t1Score,
          },
          team2: {
            type: "player" as const, id: p2.id,
            label: p2.displayName,
            teamColor: p2.teamColor, handicap: t2Hc, strokes: t2Strokes, score: t2Score,
          },
          winner,
        };
      })
      .filter((m): m is MatchDisplay => m !== null);
  };

  // Get per-match hole results for mini scorecard
  const getHoleMatchResults = (holeNum: number): ("team1" | "team2" | "tie" | null)[] => {
    const sec = sectionForHole(holeNum);
    if (!sec) return [];
    const hdcpIdx = getHoleHandicapIndex(holeNum);

    return sec.matches.map((m) => {
      if (sec.format === "scramble") {
        const t1Score = scores[getScorerKey("pair", pairs[0].id, holeNum)];
        const t2Score = scores[getScorerKey("pair", pairs[1].id, holeNum)];
        if (t1Score === undefined || t2Score === undefined) return null;
        const t1Hc = pairHcMap.get(pairs[0].id) || 0;
        const t2Hc = pairHcMap.get(pairs[1].id) || 0;
        const diffHc = Math.abs(t1Hc - t2Hc);
        const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
        const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
        const t1Net = t1Score - t1Strokes;
        const t2Net = t2Score - t2Strokes;
        if (t1Net < t2Net) return "team1";
        if (t2Net < t1Net) return "team2";
        return "tie";
      }

      const t1Score = scores[getScorerKey("player", m.team1Player.id, holeNum)];
      const t2Score = scores[getScorerKey("player", m.team2Player.id, holeNum)];
      if (t1Score === undefined || t2Score === undefined) return null;
      const t1Hc = playerHcMap.get(m.team1Player.id) || 0;
      const t2Hc = playerHcMap.get(m.team2Player.id) || 0;
      const diffHc = Math.abs(t1Hc - t2Hc);
      const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
      const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
      const t1Net = t1Score - t1Strokes;
      const t2Net = t2Score - t2Strokes;
      if (t1Net < t2Net) return "team1";
      if (t2Net < t1Net) return "team2";
      return "tie";
    });
  };

  // Helper to render hole result indicators in the mini scorecard
  const renderHoleIndicator = (holeNum: number) => {
    const results = getHoleMatchResults(holeNum);
    const dotColor = (winner: "team1" | "team2" | "tie" | null) => {
      if (winner === "team1") return team1Color;
      if (winner === "team2") return team2Color;
      if (winner === "tie") return "#9ca3af"; // gray-400
      return undefined;
    };

    return (
      <div className="flex flex-col items-center gap-px">
        {results.map((winner, i) => {
          const color = dotColor(winner);
          return (
            <span
              key={i}
              className={`inline-block w-2 h-2 rounded-full${color ? "" : " bg-gray-200"}`}
              style={color ? { backgroundColor: color } : undefined}
            />
          );
        })}
      </div>
    );
  };

  // Helper to render a scorer cell within a match row
  const renderScorerCell = (
    side: MatchDisplaySide,
    isWinner: boolean,
    isTied: boolean,
    color: string,
    holePar: number,
  ) => {
    const hasValue = side.score !== undefined;

    return (
      <div
        className={`flex-1 rounded-lg overflow-hidden border-l-[3px] ${
          isWinner
            ? "bg-green-50 border-green-400"
            : isTied
            ? "bg-gray-50 border-gray-300"
            : "bg-gray-50 border-transparent"
        }`}
      >
        {/* Team color bar — flush across top of cell */}
        <div className="h-[3px]" style={{ backgroundColor: color }} />
        <div className="px-2 py-1">
        {/* Handicap + Name + strokes */}
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">({side.handicap})</span>
          <span className="text-[11px] font-semibold text-gray-700 truncate">{side.label}</span>
          {side.strokes > 0 && (
            <span className="text-[9px] text-indigo-600 font-bold flex-shrink-0">
              +{side.strokes}
            </span>
          )}
        </div>
        {/* Score controls */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => handleDecrement(side.type, side.id)}
            onTouchStart={() => handleDecrementStart(side.type, side.id)}
            onTouchEnd={handleDecrementEnd}
            onMouseDown={() => handleDecrementStart(side.type, side.id)}
            onMouseUp={handleDecrementEnd}
            onMouseLeave={handleDecrementEnd}
            disabled={isLocked || (hasValue && side.score! <= 1)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white text-sm font-bold disabled:opacity-30"
            style={{ backgroundColor: color }}
          >
            −
          </button>
          <span className={`text-lg font-bold w-7 text-center tabular-nums ${scoreColorClass(side.score, holePar)}`}>
            {hasValue ? side.score : "·"}
          </span>
          <button
            onClick={() => handleIncrement(side.type, side.id)}
            disabled={isLocked}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white text-sm font-bold disabled:opacity-30"
            style={{ backgroundColor: color }}
          >
            +
          </button>
        </div>
        </div>
      </div>
    );
  };

  // ── onHoleChange callback ──

  const handleHoleChange = useCallback((_holeIndex: number, hole: HoleInfo) => {
    currentHoleRef.current = hole;
  }, []);

  // ── Render ──

  return (
    <>
      <ScoringShell
        holes={holes}
        startingHole={startingHole}
        onClose={() => router.push("/kgb-cup")}
        saveStatus={saveStatus}
        onHoleChange={handleHoleChange}
        headerRight={
          <button
            onClick={() => { setShowLeaderboard(true); logActivity("leaderboard_view", "/kgb-cup/scoring", { contest_id: contestId }); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        }
        statusBanner={
          <>
            {contestVerified && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 bg-green-50 text-green-700 text-xs font-medium shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Verified — Scores Official
              </div>
            )}
            {scoringClosed && !contestVerified && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Scoring Closed — Under Review
              </div>
            )}
          </>
        }
        renderScorecardRows={(holeList, currentHoleNumber) => {
          const currentSection = getSection(currentHoleNumber);
          const isInCurrentSection = (holeNum: number) => getSection(holeNum) === currentSection;

          const hasBothNines = holeList.length > 9 && holeList[0]?.hole_number <= 9;
          const front9 = hasBothNines ? holeList.filter((h) => h.hole_number <= 9) : [];
          const back9 = hasBothNines ? holeList.filter((h) => h.hole_number > 9) : [];
          const front9Par = front9.reduce((s, h) => s + h.par, 0);
          const back9Par = back9.reduce((s, h) => s + h.par, 0);
          const totalPar = holeList.reduce((s, h) => s + h.par, 0);

          return (
            <>
              {/* Handicap */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                    )}
                    <td className={`px-0 py-0.5 text-center text-gray-300${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>
                      {h.handicap_index}
                    </td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                )}
                <td className="px-0 py-0.5 text-center text-gray-300 border-l border-gray-200" />
              </tr>
              {/* Par */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
                        {front9Par}
                      </td>
                    )}
                    <td className={`px-0 py-0.5 text-center text-gray-400${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>
                      {h.par}
                    </td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
                    {back9Par}
                  </td>
                )}
                <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-gray-200">
                  {totalPar}
                </td>
              </tr>
              {/* Hole winner indicators */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center border-l border-r border-gray-200" />
                    )}
                    <td className={`px-0 py-0.5 text-center${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>
                      {renderHoleIndicator(h.hole_number)}
                    </td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center border-l border-r border-gray-200" />
                )}
                <td className="px-0 py-0.5 text-center border-l border-gray-200" />
              </tr>
            </>
          );
        }}
        renderScorePanel={(hole) => {
          const currentMatches = getMatchesForDisplay(hole.hole_number);

          return (
            <div
              ref={matchPanelRef}
              className="px-2 pt-1.5 pb-2 flex flex-col justify-center"
              style={{
                minHeight: matchPanelHeight > 0 ? `${matchPanelHeight}px` : undefined,
              }}
            >
              {currentMatches.map((match, mi) => (
                <div key={mi} className={`flex items-stretch gap-1 ${mi > 0 ? "mt-1" : ""}`}>
                  {renderScorerCell(
                    match.team1,
                    match.winner === "team1",
                    match.winner === "tie",
                    team1Color,
                    hole.par,
                  )}

                  <div className="flex items-center px-0.5">
                    <span className="text-[9px] text-gray-300 font-medium">vs</span>
                  </div>

                  {renderScorerCell(
                    match.team2,
                    match.winner === "team2",
                    match.winner === "tie",
                    team2Color,
                    hole.par,
                  )}
                </div>
              ))}
            </div>
          );
        }}
      />

      {/* Leaderboard Popup */}
      {showLeaderboard && (
        <KgbCupLeaderboardPopup
          contestId={contestId}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </>
  );
}
