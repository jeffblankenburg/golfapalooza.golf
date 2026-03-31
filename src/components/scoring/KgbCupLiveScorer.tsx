"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  formatMatchStatus,
  type FoursomeResult,
  type MatchResult,
  type OverallResult,
} from "@/lib/kgb-cup/match-logic";

type ImageView = "overhead" | "green";
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

interface HoleInfo {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number;
  tee_color: string | null;
  overhead_image_url: string | null;
  green_image_url: string | null;
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
  players: PlayerInfo[];
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

function getDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
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
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
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
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

        {/* Hero scoreboard */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">KGB Cup</h2>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-sm font-bold mb-1" style={{ color: t1Color }}>{team1?.team_name || "Team 1"}</p>
              <p className="text-3xl font-black" style={{ color: t1Color }}>{overall.team1Points}</p>
            </div>
            <div className="text-xl text-gray-200 font-light">vs</div>
            <div className="text-center">
              <p className="text-sm font-bold mb-1" style={{ color: t2Color }}>{team2?.team_name || "Team 2"}</p>
              <p className="text-3xl font-black" style={{ color: t2Color }}>{overall.team2Points}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 relative">
            <div className="relative h-3 rounded-full overflow-hidden bg-gray-200">
              <div
                className="absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-l-full"
                style={{ width: `${t1Pct}%`, backgroundColor: t1Color }}
              />
              <div
                className="absolute right-0 top-0 h-full transition-all duration-700 ease-out rounded-r-full"
                style={{ width: `${t2Pct}%`, backgroundColor: t2Color }}
              />
            </div>
            {maxPoints > 0 && (
              <div
                className="absolute top-0 h-3 w-0.5 bg-yellow-400"
                style={{ left: "50%" }}
              >
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-yellow-600 font-bold">{clinch}</span>
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-gray-400">
            {overall.completedSections} of {overall.totalSections} matches complete
            {overall.winner === "team1" && <span className="font-bold" style={{ color: t1Color }}> — {team1?.team_name} wins!</span>}
            {overall.winner === "team2" && <span className="font-bold" style={{ color: t2Color }}> — {team2?.team_name} wins!</span>}
            {overall.winner === "tied" && <span className="font-bold text-gray-600"> — Tied!</span>}
          </p>
        </div>

        {/* Group results */}
        <div className="space-y-2">
          {foursomes.map((f, i) => {
            const pair1Label = f.team1_pair
              ? [f.team1_pair.player_a, f.team1_pair.player_b].filter(Boolean).join(" & ")
              : "TBD";
            const pair2Label = f.team2_pair
              ? [f.team2_pair.player_a, f.team2_pair.player_b].filter(Boolean).join(" & ")
              : "TBD";
            const r = f.results;

            return (
              <LeaderboardGroupRow
                key={f.id}
                groupNum={i + 1}
                pair1Label={pair1Label}
                pair2Label={pair2Label}
                results={r}
                team1Name={team1?.team_name || "Team 1"}
                team2Name={team2?.team_name || "Team 2"}
                t1Color={t1Color}
                t2Color={t2Color}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LeaderboardGroupRow({
  groupNum,
  pair1Label,
  pair2Label,
  results,
  team1Name,
  team2Name,
  t1Color,
  t2Color,
}: {
  groupNum: number;
  pair1Label: string;
  pair2Label: string;
  results: FoursomeResult;
  team1Name: string;
  team2Name: string;
  t1Color: string;
  t2Color: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-gray-100"
      >
        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex-shrink-0">
          {groupNum}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-medium truncate" style={{ color: t1Color }}>{pair1Label}</span>
            <span className="text-gray-300">vs</span>
            <span className="font-medium truncate" style={{ color: t2Color }}>{pair2Label}</span>
          </div>
        </div>
        <span className="text-xs font-bold flex-shrink-0">
          <span style={{ color: t1Color }}>{results.team1TotalPoints}</span>
          <span className="text-gray-300"> - </span>
          <span style={{ color: t2Color }}>{results.team2TotalPoints}</span>
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-3 py-1.5 space-y-1">
          {results.matches.map((m) => {
            const statusText = formatMatchStatus(m)
              .replace("T1", team1Name.length > 10 ? team1Name.slice(0, 8) + ".." : team1Name)
              .replace("T2", team2Name.length > 10 ? team2Name.slice(0, 8) + ".." : team2Name);

            const statusColor =
              m.sectionWinner === "team1" ? t1Color :
              m.sectionWinner === "team2" ? t2Color :
              undefined;

            return (
              <div key={m.matchIndex} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 truncate">{m.label}</p>
                  <div className="flex gap-0.5 mt-0.5">
                    {m.holeResults.map((hr) => (
                      <span
                        key={hr.hole}
                        className={`w-2 h-2 rounded-full ${
                          hr.winner === "tie" ? "bg-gray-300" :
                          hr.winner === null ? "bg-gray-100" : ""
                        }`}
                        style={
                          hr.winner === "team1" ? { backgroundColor: t1Color } :
                          hr.winner === "team2" ? { backgroundColor: t2Color } :
                          undefined
                        }
                      />
                    ))}
                  </div>
                </div>
                <p
                  className={`text-[10px] font-semibold flex-shrink-0 ${
                    m.sectionWinner === "halved" ? "text-gray-500" :
                    m.sectionWinner === "incomplete" ? "text-gray-400" : ""
                  }`}
                  style={statusColor ? { color: statusColor } : undefined}
                >
                  {statusText}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function KgbCupLiveScorer({
  foursomeId,
  contestId,
  players,
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

  const initialIndex = Math.max(0, holes.findIndex((h) => h.hole_number === startingHole));
  const [currentHoleIndex, setCurrentHoleIndex] = useState(initialIndex);
  const [imageView, setImageView] = useState<ImageView>("overhead");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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

  // Swipe / pinch state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const SWIPE_THRESHOLD = 50;

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSnapBack, setIsSnapBack] = useState(false);
  const gestureRef = useRef({
    isPinching: false,
    isPanning: false,
    initialDist: 0,
    initialScale: 1,
    initialOffset: { x: 0, y: 0 },
    initialMid: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
  });

  const scorecardRef = useRef<HTMLDivElement>(null);
  const matchPanelRef = useRef<HTMLDivElement>(null);
  const [matchPanelHeight, setMatchPanelHeight] = useState(0);
  const hole = holes[currentHoleIndex];


  const playerHcMap = new Map<string, number>();
  for (const h of playerHandicaps) playerHcMap.set(h.playerId, h.adjustedHandicap);
  const pairHcMap = new Map<string, number>();
  for (const h of pairHandicaps) pairHcMap.set(h.pairId, h.scrambleHandicap);

  const team1Color = pairs[0]?.players[0]?.teamColor || "#3b82f6";
  const team2Color = pairs[1]?.players[0]?.teamColor || "#ef4444";

  const getHoleHandicapIndex = (holeNum: number): number => {
    return holes.find((h) => h.hole_number === holeNum)?.handicap_index || 0;
  };

  const getSection = (holeNum: number): 1 | 2 | 3 => {
    if (holeNum <= 6) return 1;
    if (holeNum <= 12) return 2;
    return 3;
  };

  const currentSection = getSection(hole.hole_number);
  const isInCurrentSection = (holeNum: number) => getSection(holeNum) === currentSection;

  // Get matches for display in the score grid
  const getMatchesForDisplay = (holeNum: number): MatchDisplay[] => {
    const section = getSection(holeNum);

    if (section === 3) {
      const p1 = pairs[0];
      const p2 = pairs[1];
      const t1Hc = pairHcMap.get(p1.id) || 0;
      const t2Hc = pairHcMap.get(p2.id) || 0;
      const diffHc = Math.abs(t1Hc - t2Hc);
      const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, getHoleHandicapIndex(holeNum)) : 0;
      const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, getHoleHandicapIndex(holeNum)) : 0;
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

      return [{
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
      }];
    }

    const matchPairings = section === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    return matchPairings
      .filter(([a, b]) => players[a] && players[b])
      .map(([t1Idx, t2Idx]) => {
        const p1 = players[t1Idx];
        const p2 = players[t2Idx];
        const t1Hc = playerHcMap.get(p1.id) || 0;
        const t2Hc = playerHcMap.get(p2.id) || 0;
        const diffHc = Math.abs(t1Hc - t2Hc);
        const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, getHoleHandicapIndex(holeNum)) : 0;
        const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, getHoleHandicapIndex(holeNum)) : 0;
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
      });
  };

  // Get per-match hole results for mini scorecard
  // Returns an array of winners: "team1" | "team2" | "tie" | null per match on that hole
  const getHoleMatchResults = (holeNum: number): ("team1" | "team2" | "tie" | null)[] => {
    const section = getSection(holeNum);
    const hdcpIdx = getHoleHandicapIndex(holeNum);

    if (section === 3) {
      const t1Score = scores[getScorerKey("pair", pairs[0].id, holeNum)];
      const t2Score = scores[getScorerKey("pair", pairs[1].id, holeNum)];
      if (t1Score === undefined || t2Score === undefined) return [null];
      const t1Hc = pairHcMap.get(pairs[0].id) || 0;
      const t2Hc = pairHcMap.get(pairs[1].id) || 0;
      const diffHc = Math.abs(t1Hc - t2Hc);
      const t1Strokes = t1Hc > t2Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
      const t2Strokes = t2Hc > t1Hc ? getStrokesOnHole(diffHc, hdcpIdx) : 0;
      const t1Net = t1Score - t1Strokes;
      const t2Net = t2Score - t2Strokes;
      if (t1Net < t2Net) return ["team1"];
      if (t2Net < t1Net) return ["team2"];
      return ["tie"];
    }

    const matchPairings = section === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    return matchPairings.map(([t1Idx, t2Idx]) => {
      if (!players[t1Idx] || !players[t2Idx]) return null;
      const t1Score = scores[getScorerKey("player", players[t1Idx].id, holeNum)];
      const t2Score = scores[getScorerKey("player", players[t2Idx].id, holeNum)];
      if (t1Score === undefined || t2Score === undefined) return null;
      const t1Hc = playerHcMap.get(players[t1Idx].id) || 0;
      const t2Hc = playerHcMap.get(players[t2Idx].id) || 0;
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

  // Reset zoom on hole change
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [currentHoleIndex]);

  // Track max height of the match panel so it stays stable when switching sections
  useEffect(() => {
    if (matchPanelRef.current) {
      const h = matchPanelRef.current.scrollHeight;
      setMatchPanelHeight((prev) => Math.max(prev, h));
    }
  });

  // Auto-scroll mini scorecard
  useEffect(() => {
    if (scorecardRef.current) {
      const activeCell = scorecardRef.current.querySelector('[data-active="true"]');
      if (activeCell) {
        (activeCell as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [currentHoleIndex]);

  // ── Navigation ──

  const goToHole = useCallback(
    (index: number) => {
      if (index >= 0 && index < holes.length) {
        setIsAnimating(true);
        setCurrentHoleIndex(index);
        setDragOffset(0);
        setTimeout(() => setIsAnimating(false), 300);
      }
    },
    [holes.length]
  );

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
    const holeNum = hole.hole_number;
    const key = getScorerKey(scorerType, scorerId, holeNum);
    const current = scores[key];
    const newVal = current !== undefined ? Math.min(current + 1, 20) : hole.par;
    setScores((prev) => ({ ...prev, [key]: newVal }));
    dirtyRef.current.set(key, { foursome_id: foursomeId, hole_number: holeNum, scorer_type: scorerType, scorer_id: scorerId, strokes: newVal });
    scheduleSave();
  };

  const handleDecrement = (scorerType: "player" | "pair", scorerId: string) => {
    if (isLocked) return;
    const holeNum = hole.hole_number;
    const key = getScorerKey(scorerType, scorerId, holeNum);
    const current = scores[key];
    if (current === undefined || current <= 1) return;
    const newVal = current - 1;
    setScores((prev) => ({ ...prev, [key]: newVal }));
    dirtyRef.current.set(key, { foursome_id: foursomeId, hole_number: holeNum, scorer_type: scorerType, scorer_id: scorerId, strokes: newVal });
    scheduleSave();
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDecrementStart = (scorerType: "player" | "pair", scorerId: string) => {
    if (isLocked) return;
    longPressTimer.current = setTimeout(() => {
      const holeNum = hole.hole_number;
      const key = getScorerKey(scorerType, scorerId, holeNum);
      setScores((prev) => { const next = { ...prev }; delete next[key]; return next; });
      dirtyRef.current.delete(key);
    }, 800);
  };
  const handleDecrementEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Touch Handlers (swipe + pinch) ──

  const handleTouchStart = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (e.touches.length === 2) {
      g.isPinching = true;
      g.isPanning = false;
      g.initialDist = getDistance(e.touches[0], e.touches[1]);
      g.initialScale = scale;
      g.initialOffset = { x: offset.x, y: offset.y };
      g.initialMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setIsSnapBack(false);
      isHorizontalSwipe.current = null;
    } else if (e.touches.length === 1 && scale > 1) {
      g.isPanning = true;
      g.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      g.panStartOffset = { x: offset.x, y: offset.y };
    } else if (e.touches.length === 1 && scale === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isHorizontalSwipe.current = null;
      setIsAnimating(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (g.isPinching && e.touches.length >= 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.min(4, Math.max(1, g.initialScale * (dist / g.initialDist)));
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setScale(newScale);
      setOffset({ x: g.initialOffset.x + (mid.x - g.initialMid.x), y: g.initialOffset.y + (mid.y - g.initialMid.y) });
      return;
    }
    if (g.isPanning && e.touches.length === 1) {
      e.preventDefault();
      setOffset({ x: g.panStartOffset.x + (e.touches[0].clientX - g.panStart.x), y: g.panStartOffset.y + (e.touches[0].clientY - g.panStart.y) });
      return;
    }
    if (scale === 1) {
      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      if (isHorizontalSwipe.current === null) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
      }
      if (isHorizontalSwipe.current) {
        e.preventDefault();
        setDragOffset(deltaX);
      }
    }
  };

  const handleTouchEnd = () => {
    const g = gestureRef.current;
    if (g.isPinching) {
      g.isPinching = false;
      if (scale < 1.1) {
        setIsSnapBack(true);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setTimeout(() => setIsSnapBack(false), 200);
      }
      return;
    }
    if (g.isPanning) { g.isPanning = false; return; }
    if (scale === 1) {
      if (Math.abs(dragOffset) > SWIPE_THRESHOLD) {
        if (dragOffset < 0 && currentHoleIndex < holes.length - 1) goToHole(currentHoleIndex + 1);
        else if (dragOffset > 0 && currentHoleIndex > 0) goToHole(currentHoleIndex - 1);
        else setDragOffset(0);
      } else {
        setDragOffset(0);
      }
      isHorizontalSwipe.current = null;
    }
  };

  if (!hole) return null;

  const currentMatches = getMatchesForDisplay(hole.hole_number);
  const currentImageUrl = imageView === "overhead" ? hole.overhead_image_url : hole.green_image_url;
  const hasOverhead = !!hole.overhead_image_url;
  const hasGreen = !!hole.green_image_url;
  const hasAnyImage = hasOverhead || hasGreen;

  // Helper to render a scorer cell within a match row
  const renderScorerCell = (
    side: MatchDisplaySide,
    isWinner: boolean,
    isTied: boolean,
    color: string,
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
            disabled={isLocked || !hasValue}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 text-gray-700 text-sm font-bold active:bg-gray-300 disabled:opacity-30"
          >
            −
          </button>
          <span className={`text-lg font-bold w-7 text-center tabular-nums ${scoreColorClass(side.score, hole.par)}`}>
            {hasValue ? side.score : "·"}
          </span>
          <button
            onClick={() => handleIncrement(side.type, side.id)}
            disabled={isLocked}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold active:bg-indigo-700 disabled:opacity-30"
          >
            +
          </button>
        </div>
        </div>
      </div>
    );
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

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => router.push("/kgb-cup")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h1 className="text-lg font-bold text-gray-900">Hole {hole.hole_number}</h1>

        <div className="flex items-center gap-2">
          {hasAnyImage && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setImageView("overhead")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${imageView === "overhead" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                Overhead
              </button>
              <button
                onClick={() => setImageView("green")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${imageView === "green" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                Green
              </button>
            </div>
          )}
          <button
            onClick={() => setShowLeaderboard(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hole stats */}
      <div className="flex items-center justify-center gap-4 px-4 py-1.5 text-sm text-gray-500 bg-gray-50 shrink-0">
        <span>Par <span className="font-bold text-gray-900">{hole.par}</span></span>
        <span className="w-px h-4 bg-gray-200" />
        <span><span className="font-bold text-gray-900">{hole.yards}</span> yds</span>
        <span className="w-px h-4 bg-gray-200" />
        <span>Hdcp <span className="font-bold text-gray-900">{hole.handicap_index}</span></span>
      </div>

      {/* Mini Scorecard Table */}
      <div ref={scorecardRef} className="overflow-x-auto border-t border-gray-200 bg-white shrink-0">
        <table className="w-full text-[10px]" style={{ tableLayout: "fixed", minWidth: "600px" }}>
          <colgroup>
            {holes.map((h) => <col key={h.hole_number} />)}
          </colgroup>
          <thead>
            <tr className="bg-gray-50">
              {holes.map((h) => (
                <th key={h.hole_number} data-active={h.hole_number === hole.hole_number}
                  onClick={() => goToHole(holes.findIndex((x) => x.hole_number === h.hole_number))}
                  className={`px-0 py-1 text-center font-bold cursor-pointer ${h.hole_number === hole.hole_number ? "bg-indigo-600 text-white" : isInCurrentSection(h.hole_number) ? "bg-indigo-50 text-indigo-700" : "text-gray-500"}`}
                >{h.hole_number}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Handicap */}
            <tr className="border-t border-gray-100">
              {holes.map((h) => <td key={h.hole_number} className={`px-0 py-0.5 text-center text-gray-300${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>{h.handicap_index}</td>)}
            </tr>
            {/* Par */}
            <tr className="border-t border-gray-100">
              {holes.map((h) => <td key={h.hole_number} className={`px-0 py-0.5 text-center text-gray-400${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>{h.par}</td>)}
            </tr>
            {/* Hole winner indicators */}
            <tr className="border-t border-gray-100">
              {holes.map((h) => (
                <td key={h.hole_number} className={`px-0 py-0.5 text-center${isInCurrentSection(h.hole_number) ? " bg-indigo-50" : ""}`}>
                  {renderHoleIndicator(h.hole_number)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Scoring status banner */}
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

      {/* Swipeable Image Area — save status overlays here */}
      <div
        className="flex-1 min-h-0 overflow-hidden bg-white relative touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Save status overlay */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 text-xs font-medium transition-all duration-300 ${
            saveStatus === "idle"
              ? "opacity-0 -translate-y-full pointer-events-none"
              : saveStatus === "saving"
              ? "opacity-100 translate-y-0 bg-blue-50/90 text-blue-600 py-1"
              : saveStatus === "saved"
              ? "opacity-100 translate-y-0 bg-green-50/90 text-green-600 py-1"
              : "opacity-100 translate-y-0 bg-red-50/90 text-red-600 py-1"
          }`}
        >
          {saveStatus === "saving" && (
            <>
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          )}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed — will retry"}
        </div>

        {/* Navigation arrows */}
        {currentHoleIndex > 0 && (
          <button onClick={() => goToHole(currentHoleIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 text-white active:bg-black/40">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        {currentHoleIndex < holes.length - 1 && (
          <button onClick={() => goToHole(currentHoleIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 text-white active:bg-black/40">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        <div
          className="w-full h-full relative"
          style={{
            transform: scale === 1
              ? `translateX(${dragOffset}px)`
              : `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transition: isSnapBack ? "transform 0.2s ease-out" : isAnimating ? "transform 0.3s ease-out" : "none",
          }}
        >
          {currentImageUrl ? (
            <Image
              key={`${hole.hole_number}-${imageView}`}
              src={currentImageUrl}
              alt={`Hole ${hole.hole_number} ${imageView} view`}
              fill
              className="object-contain animate-fade-in"
              priority
              sizes="(max-width: 768px) 100vw, 512px"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No {imageView} image</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom score area — match-based layout, fixed height so nav arrows don't shift */}
      <div
        ref={matchPanelRef}
        className="shrink-0 bg-white border-t border-gray-200 px-2 pt-1.5 pb-2 flex flex-col justify-center"
        style={{
          paddingBottom: "max(0.5rem, calc(0.5rem + env(safe-area-inset-bottom)))",
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
            )}

            <div className="flex items-center px-0.5">
              <span className="text-[9px] text-gray-300 font-medium">vs</span>
            </div>

            {renderScorerCell(
              match.team2,
              match.winner === "team2",
              match.winner === "tie",
              team2Color,
            )}
          </div>
        ))}
      </div>

      {/* Leaderboard Popup */}
      {showLeaderboard && (
        <KgbCupLeaderboardPopup
          contestId={contestId}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
}
