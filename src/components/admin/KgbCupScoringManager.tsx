"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  computeFoursomeResult,
  computeOverallResults,
  formatMatchStatus,
  getStrokesOnHole,
  getSectionHoles,
  type FoursomeData,
  type HoleScore,
  type HoleInfo,
  type FoursomeResult,
  type MatchResult,
} from "@/lib/kgb-cup/match-logic";
import { KgbCupScoreboard, KgbCupGroupResults, type KgbGroupData } from "@/components/kgb-cup/KgbCupResultsView";

// ── Types ──

interface PlayerInfo {
  id: string;
  display_name: string;
  full_name: string | null;
}

interface PairInfo {
  id: string;
  team_id: string;
  sort_order: number;
  player_a_id: string | null;
  player_b_id: string | null;
  player_a: PlayerInfo | null;
  player_b: PlayerInfo | null;
}

interface TeamInfo {
  id: string;
  team_number: number;
  team_name: string;
  team_color: string | null;
}

// Default colors when no team color is assigned
const DEFAULT_TEAM1_COLOR = "#3b82f6"; // blue-500
const DEFAULT_TEAM2_COLOR = "#ef4444"; // red-500

function getTeamColor(teams: TeamInfo[], teamNumber: 1 | 2): string {
  const team = teams.find((t) => t.team_number === teamNumber);
  return team?.team_color || (teamNumber === 1 ? DEFAULT_TEAM1_COLOR : DEFAULT_TEAM2_COLOR);
}

interface PairHandicapRow {
  id: string;
  team_id: string;
  player_a: { id: string; display_name: string } | null;
  player_b: { id: string; display_name: string } | null;
  scramble_handicap: number | null;
}

interface FoursomeInfo {
  id: string;
  pair_team1_id: string;
  pair_team2_id: string;
  sort_order: number;
}

interface Contest {
  id: string;
  name: string;
  contest_type: string;
  scoring_closed_at?: string | null;
  verified_at?: string | null;
}

type Tab = "handicaps" | "scoring" | "results";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function KgbCupScoringManager({ tripId }: { tripId: string }) {
  const [contestId, setContestId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("handicaps");
  const [loading, setLoading] = useState(true);

  // Handicaps tab state
  const [pairHandicaps, setPairHandicaps] = useState<PairHandicapRow[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);

  // Scoring tab state
  const [foursomes, setFoursomes] = useState<FoursomeInfo[]>([]);
  const [pairs, setPairs] = useState<PairInfo[]>([]);
  const [holes, setHoles] = useState<HoleInfo[]>([]);
  const [scores, setScores] = useState<HoleScore[]>([]);
  const [playerHandicapMap, setPlayerHandicapMap] = useState<Map<string, number>>(new Map());
  const [pairHandicapMap, setPairHandicapMap] = useState<Map<string, number>>(new Map());
  const [selectedFoursomeId, setSelectedFoursomeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [scoringClosed, setScoringClosed] = useState(false);
  const [contestVerified, setContestVerified] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  const dirtyScoresRef = useRef<Map<string, { foursome_id: string; hole_number: number; scorer_type: string; scorer_id: string; strokes: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find the ryder_cup contest
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const rc = (data.contests || []).find(
      (c: Contest) => c.contest_type === "ryder_cup"
    );
    if (rc) {
      setContestId(rc.id);
      setScoringClosed(!!rc.scoring_closed_at);
      setContestVerified(!!rc.verified_at);
    }
    return rc?.id || null;
  }, [tripId]);

  // Fetch handicap data (pair scramble handicaps only)
  const fetchHandicaps = useCallback(async (cId: string) => {
    const res = await fetch(`/api/admin/kgb-cup/handicaps?contest_id=${cId}`);
    const data = await res.json();
    setPairHandicaps(data.pairs || []);
    setTeams(data.teams || []);
  }, []);

  // Fetch scoring data (foursomes are now derived server-side from pairs)
  const fetchScoringData = useCallback(async (cId: string) => {
    const res = await fetch(`/api/admin/kgb-cup/scores?contest_id=${cId}`);
    const data = await res.json();

    const foursomeList: FoursomeInfo[] = data.foursomes || [];
    const pairList: PairInfo[] = data.pairs || [];
    const teamList: TeamInfo[] = data.teams || [];

    setFoursomes(foursomeList);
    setPairs(pairList);
    setHoles(data.holes || []);
    setScores(data.scores || []);
    setTeams(teamList);

    // Build base handicap map from player_handicaps table
    const baseMap = new Map<string, number>();
    for (const bh of data.base_handicaps || []) {
      baseMap.set(bh.user_id, bh.handicap_index);
    }

    // Compute per-foursome adjusted handicaps (subtract lowest in each foursome)
    const phMap = new Map<string, number>();
    for (const f of foursomeList) {
      const p1 = pairList.find((p) => p.id === f.pair_team1_id);
      const p2 = pairList.find((p) => p.id === f.pair_team2_id);
      const playerIds = [p1?.player_a_id, p1?.player_b_id, p2?.player_a_id, p2?.player_b_id].filter(Boolean) as string[];
      const handicaps = playerIds.map((id) => baseMap.get(id) ?? 0);
      const lowest = Math.min(...handicaps);
      for (let i = 0; i < playerIds.length; i++) {
        phMap.set(playerIds[i], Math.round(handicaps[i] - lowest));
      }
    }
    setPlayerHandicapMap(phMap);

    const prMap = new Map<string, number>();
    for (const ph of data.pair_handicaps || []) {
      prMap.set(ph.pair_id, ph.scramble_handicap);
    }
    setPairHandicapMap(prMap);

    if (!selectedFoursomeId && foursomeList.length > 0) {
      setSelectedFoursomeId(foursomeList[0].id);
    }
  }, [selectedFoursomeId]);

  // Initialize
  useEffect(() => {
    async function init() {
      setLoading(true);
      const cId = await fetchContest();
      if (cId) {
        await Promise.all([fetchHandicaps(cId), fetchScoringData(cId)]);
      }
      setLoading(false);
    }
    init();
  }, [fetchContest, fetchHandicaps, fetchScoringData]);

  // Auto-save logic
  const flushSaves = useCallback(async () => {
    const scoresToSave = Array.from(dirtyScoresRef.current.values());
    if (scoresToSave.length === 0) return;

    dirtyScoresRef.current.clear();
    setSaveStatus("saving");

    try {
      const res = await fetch("/api/admin/kgb-cup/scores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: scoresToSave }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        for (const s of scoresToSave) {
          dirtyScoresRef.current.set(`${s.foursome_id}-${s.hole_number}-${s.scorer_type}-${s.scorer_id}`, s);
        }
      }
    } catch {
      setSaveStatus("error");
      for (const s of scoresToSave) {
        dirtyScoresRef.current.set(`${s.foursome_id}-${s.hole_number}-${s.scorer_type}-${s.scorer_id}`, s);
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 500);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirtyScores = dirtyScoresRef;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const scoresToSave = Array.from(dirtyScores.current.values());
      if (scoresToSave.length > 0) {
        fetch("/api/admin/kgb-cup/scores", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores: scoresToSave }),
        });
      }
    };
  }, []);

  // Score change handler
  const handleScoreChange = (
    foursomeId: string,
    holeNumber: number,
    scorerType: "player" | "pair",
    scorerId: string,
    value: string
  ) => {
    const strokes = value === "" ? undefined : parseInt(value);
    if (strokes !== undefined && (isNaN(strokes) || strokes < 1 || strokes > 20)) return;

    setScores((prev) => {
      const filtered = prev.filter(
        (s) => !(s.foursome_id === foursomeId && s.hole_number === holeNumber && s.scorer_type === scorerType && s.scorer_id === scorerId)
      );
      if (strokes !== undefined) {
        filtered.push({ foursome_id: foursomeId, hole_number: holeNumber, scorer_type: scorerType, scorer_id: scorerId, strokes });
      }
      return filtered;
    });

    if (strokes !== undefined) {
      dirtyScoresRef.current.set(`${foursomeId}-${holeNumber}-${scorerType}-${scorerId}`, {
        foursome_id: foursomeId,
        hole_number: holeNumber,
        scorer_type: scorerType,
        scorer_id: scorerId,
        strokes,
      });
      scheduleSave();
    }
  };

  // Calculate handicaps
  // Update pair scramble handicap
  const handlePairHandicapChange = async (pairId: string, scrambleHandicap: number) => {
    if (!contestId) return;

    setPairHandicaps((prev) =>
      prev.map((p) =>
        p.id === pairId ? { ...p, scramble_handicap: scrambleHandicap } : p
      )
    );

    await fetch("/api/admin/kgb-cup/handicaps", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contestId,
        pair_id: pairId,
        scramble_handicap: scrambleHandicap,
      }),
    });
  };

  // Close/open/verify/unverify contest scoring lifecycle
  const handleLifecycle = async (action: "close" | "open" | "verify" | "unverify") => {
    if (!contestId) return;
    setLifecycleLoading(true);
    try {
      const res = await fetch("/api/admin/scoring-lifecycle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestId, action }),
      });
      if (res.ok) {
        if (action === "close") setScoringClosed(true);
        else if (action === "open") setScoringClosed(false);
        else if (action === "verify") setContestVerified(true);
        else if (action === "unverify") setContestVerified(false);
      }
    } catch {
      // silent
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Helper: get foursome label
  const getFoursomeLabel = (f: FoursomeInfo): string => {
    const pair1 = pairs.find((p) => p.id === f.pair_team1_id);
    const pair2 = pairs.find((p) => p.id === f.pair_team2_id);
    const p1a = pair1?.player_a?.display_name || "?";
    const p1b = pair1?.player_b?.display_name || "";
    const p2a = pair2?.player_a?.display_name || "?";
    const p2b = pair2?.player_b?.display_name || "";
    const t1 = p1b ? `${p1a} & ${p1b}` : p1a;
    const t2 = p2b ? `${p2a} & ${p2b}` : p2a;
    return `${t1}  vs  ${t2}`;
  };

  // Build foursome data for match logic
  const buildFoursomeData = (f: FoursomeInfo): FoursomeData => {
    const pair1 = pairs.find((p) => p.id === f.pair_team1_id);
    const pair2 = pairs.find((p) => p.id === f.pair_team2_id);
    return {
      id: f.id,
      pair_team1_id: f.pair_team1_id,
      pair_team2_id: f.pair_team2_id,
      team1_player_a_id: pair1?.player_a_id || null,
      team1_player_b_id: pair1?.player_b_id || null,
      team2_player_a_id: pair2?.player_a_id || null,
      team2_player_b_id: pair2?.player_b_id || null,
    };
  };

  // Build player names map from pairs
  const playerNamesMap = new Map<string, string>();
  for (const p of pairs) {
    if (p.player_a_id && p.player_a) playerNamesMap.set(p.player_a_id, p.player_a.display_name);
    if (p.player_b_id && p.player_b) playerNamesMap.set(p.player_b_id, p.player_b.display_name);
  }

  // Compute all results
  const foursomeResults: FoursomeResult[] = foursomes.map((f) =>
    computeFoursomeResult(buildFoursomeData(f), scores, playerHandicapMap, pairHandicapMap, holes, playerNamesMap)
  );
  const overall = computeOverallResults(foursomeResults);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contestId) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No KGB Cup contest found. Add a Ryder Cup contest first.
      </div>
    );
  }

  // Determine scoring readiness
  const hasTeeAssignments = holes.length > 0;
  const hasFoursomesReady = foursomes.length > 0 && pairs.some((p) => p.player_a_id && p.player_b_id);

  return (
    <div className="space-y-4">
      {/* Scoring Lifecycle Controls — above tabs */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-1.5 flex-1">
          {contestVerified ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Verified
            </span>
          ) : scoringClosed ? (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Scoring Closed
            </span>
          ) : !hasFoursomesReady ? (
            <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              Not Ready
            </span>
          ) : !hasTeeAssignments ? (
            <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              Awaiting Tee Times
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Scoring Open
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {contestVerified ? (
            <button
              onClick={() => handleLifecycle("unverify")}
              disabled={lifecycleLoading}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-50"
            >
              {lifecycleLoading ? "..." : "Unverify"}
            </button>
          ) : scoringClosed ? (
            <>
              <button
                onClick={() => handleLifecycle("open")}
                disabled={lifecycleLoading}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 active:bg-amber-200 disabled:opacity-50"
              >
                {lifecycleLoading ? "..." : "Reopen Scoring"}
              </button>
              <button
                onClick={() => handleLifecycle("verify")}
                disabled={lifecycleLoading}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-600 text-white active:bg-green-700 disabled:opacity-50"
              >
                {lifecycleLoading ? "..." : "Verify Scores"}
              </button>
            </>
          ) : (hasFoursomesReady && hasTeeAssignments) ? (
            <button
              onClick={() => handleLifecycle("close")}
              disabled={lifecycleLoading}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-100 text-red-700 active:bg-red-200 disabled:opacity-50"
            >
              {lifecycleLoading ? "..." : "Close Live Scoring"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
        {(["handicaps", "scoring", "results"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              if (t === "scoring" && tab !== "scoring") {
                // Refresh scoring data when switching to scoring tab
                if (contestId) fetchScoringData(contestId);
              }
              setTab(t);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 active:bg-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "handicaps" && (
        <HandicapsTab
          pairHandicaps={pairHandicaps}
          teams={teams}
          onPairChange={handlePairHandicapChange}
        />
      )}

      {tab === "scoring" && (
        <ScoringTab
          foursomes={foursomes}
          pairs={pairs}
          holes={holes}
          scores={scores}
          teams={teams}
          playerHandicapMap={playerHandicapMap}
          pairHandicapMap={pairHandicapMap}
          selectedFoursomeId={selectedFoursomeId}
          onSelectFoursome={setSelectedFoursomeId}
          onScoreChange={handleScoreChange}
          getFoursomeLabel={getFoursomeLabel}
          buildFoursomeData={buildFoursomeData}
          foursomeResults={foursomeResults}
          saveStatus={saveStatus}
        />
      )}

      {tab === "results" && (
        <ResultsTab
          teams={teams}
          foursomes={foursomes}
          pairs={pairs}
          foursomeResults={foursomeResults}
          overall={overall}
          getFoursomeLabel={getFoursomeLabel}
        />
      )}
    </div>
  );
}

// ── Handicaps Tab ──

function HandicapsTab({
  pairHandicaps,
  teams,
  onPairChange,
}: {
  pairHandicaps: PairHandicapRow[];
  teams: TeamInfo[];
  onPairChange: (pairId: string, handicap: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 text-center">
        Individual handicaps are set on the Loozers admin page. Stroke allocation is computed per-foursome automatically.
      </p>

      {/* Pair scramble handicaps */}
      {pairHandicaps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Pair Scramble Handicaps (Section 3)
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {teams.map((team) => {
              const teamPairs = pairHandicaps.filter((p) => p.team_id === team.id);
              if (teamPairs.length === 0) return null;
              return (
                <div key={team.id}>
                  <div className="px-3 py-1.5 bg-gray-50/50">
                    <p className="text-xs font-semibold text-gray-500">{team.team_name}</p>
                  </div>
                  {teamPairs.map((pair) => (
                    <div key={pair.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700">
                          {pair.player_a?.display_name || "TBD"}
                          {pair.player_b ? ` & ${pair.player_b.display_name}` : " (solo)"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400">HC:</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={pair.scramble_handicap ?? ""}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v) && v >= 0) onPairChange(pair.id, v);
                          }}
                          className="w-14 h-8 text-center border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-green-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scoring Tab ──

function ScoringTab({
  foursomes,
  pairs,
  holes,
  scores,
  teams,
  playerHandicapMap,
  pairHandicapMap,
  selectedFoursomeId,
  onSelectFoursome,
  onScoreChange,
  getFoursomeLabel,
  buildFoursomeData,
  foursomeResults,
  saveStatus,
}: {
  foursomes: FoursomeInfo[];
  pairs: PairInfo[];
  holes: HoleInfo[];
  scores: HoleScore[];
  teams: TeamInfo[];
  playerHandicapMap: Map<string, number>;
  pairHandicapMap: Map<string, number>;
  selectedFoursomeId: string | null;
  onSelectFoursome: (id: string) => void;
  onScoreChange: (foursomeId: string, hole: number, scorerType: "player" | "pair", scorerId: string, value: string) => void;
  getFoursomeLabel: (f: FoursomeInfo) => string;
  buildFoursomeData: (f: FoursomeInfo) => FoursomeData;
  foursomeResults: FoursomeResult[];
  saveStatus: SaveStatus;
}) {
  const selectedFoursome = foursomes.find((f) => f.id === selectedFoursomeId);
  const selectedResult = foursomeResults.find((r) => r.foursomeId === selectedFoursomeId);

  // Check if pairings are complete (all foursomes have 4 players)
  const pairingsComplete = foursomes.length > 0 && foursomes.every((f) => {
    const p1 = pairs.find((p) => p.id === f.pair_team1_id);
    const p2 = pairs.find((p) => p.id === f.pair_team2_id);
    return p1?.player_a_id && p1?.player_b_id && p2?.player_a_id && p2?.player_b_id;
  });

  if (foursomes.length === 0 || !pairingsComplete) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Complete team pairings in the KGB Cup Teams section first.
      </div>
    );
  }

  if (holes.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">Set up tee assignments before entering scores.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Foursome selector + save status on same row */}
      <div className="flex items-center gap-2">
        <select
          value={selectedFoursomeId || ""}
          onChange={(e) => onSelectFoursome(e.target.value)}
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-white"
        >
          {foursomes.map((f, i) => (
            <option key={f.id} value={f.id}>
              Group {i + 1}: {getFoursomeLabel(f)}
            </option>
          ))}
        </select>
        {saveStatus !== "idle" && (
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
            saveStatus === "saving" ? "bg-blue-50 text-blue-600" :
            saveStatus === "saved" ? "bg-green-50 text-green-600" :
            "bg-red-50 text-red-600"
          }`}>
            {saveStatus === "saving" ? (
              <>
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Saving
              </>
            ) : saveStatus === "saved" ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Retry
              </>
            )}
          </div>
        )}
      </div>

      {selectedFoursome && (
        <FoursomeScoreEntry
          foursome={selectedFoursome}
          foursomeData={buildFoursomeData(selectedFoursome)}
          pairs={pairs}
          holes={holes}
          scores={scores}
          teams={teams}
          playerHandicapMap={playerHandicapMap}
          pairHandicapMap={pairHandicapMap}
          onScoreChange={onScoreChange}
          result={selectedResult || null}
        />
      )}
    </div>
  );
}

// ── Foursome Score Entry ──

function FoursomeScoreEntry({
  foursome,
  foursomeData,
  pairs,
  holes,
  scores,
  teams,
  playerHandicapMap,
  pairHandicapMap,
  onScoreChange,
  result,
}: {
  foursome: FoursomeInfo;
  foursomeData: FoursomeData;
  pairs: PairInfo[];
  holes: HoleInfo[];
  scores: HoleScore[];
  teams: TeamInfo[];
  playerHandicapMap: Map<string, number>;
  pairHandicapMap: Map<string, number>;
  onScoreChange: (foursomeId: string, hole: number, scorerType: "player" | "pair", scorerId: string, value: string) => void;
  result: FoursomeResult | null;
}) {
  const team1Color = getTeamColor(teams, 1);
  const team2Color = getTeamColor(teams, 2);
  const pair1 = pairs.find((p) => p.id === foursome.pair_team1_id);
  const pair2 = pairs.find((p) => p.id === foursome.pair_team2_id);

  // Build score lookup
  const scoreLookup = new Map<string, number>();
  for (const s of scores.filter((s) => s.foursome_id === foursome.id)) {
    scoreLookup.set(`${s.scorer_type}-${s.scorer_id}-${s.hole_number}`, s.strokes);
  }

  // Gather individual players for sections 1-2
  const individualPlayers: { id: string; name: string; team: 1 | 2; slot: "a" | "b" }[] = [];
  if (pair1?.player_a) individualPlayers.push({ id: pair1.player_a.id, name: pair1.player_a.display_name, team: 1, slot: "a" });
  if (pair1?.player_b) individualPlayers.push({ id: pair1.player_b.id, name: pair1.player_b.display_name, team: 1, slot: "b" });
  if (pair2?.player_a) individualPlayers.push({ id: pair2.player_a.id, name: pair2.player_a.display_name, team: 2, slot: "a" });
  if (pair2?.player_b) individualPlayers.push({ id: pair2.player_b.id, name: pair2.player_b.display_name, team: 2, slot: "b" });

  // Scramble pairs for section 3
  const scramblePairs: { id: string; name: string; team: 1 | 2 }[] = [];
  if (pair1) {
    const name1 = [pair1.player_a?.display_name, pair1.player_b?.display_name].filter(Boolean).join(" & ");
    scramblePairs.push({ id: pair1.id, name: name1 || "Team 1 Pair", team: 1 });
  }
  if (pair2) {
    const name2 = [pair2.player_a?.display_name, pair2.player_b?.display_name].filter(Boolean).join(" & ");
    scramblePairs.push({ id: pair2.id, name: name2 || "Team 2 Pair", team: 2 });
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const container = e.currentTarget.closest(".score-section");
      if (!container) return;
      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='number']"));
      const idx = inputs.indexOf(e.currentTarget);
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    }
  };

  const renderSectionGrid = (
    sectionNum: 1 | 2 | 3,
    sectionLabel: string,
    scorers: { id: string; name: string; team: 1 | 2 }[],
    scorerType: "player" | "pair"
  ) => {
    const sectionHoles = getSectionHoles(holes, sectionNum);
    const sortedHoles = [...sectionHoles].sort((a, b) => a.hole_number - b.hole_number);

    return (
      <div key={sectionNum} className="score-section">
        <div className="px-3 py-2 bg-gray-50 rounded-t-xl border border-gray-200 border-b-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{sectionLabel}</p>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-b-xl">
          <table className="w-full border-collapse text-xs min-w-[400px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 bg-gray-50 z-10 px-2 py-1.5 text-left text-gray-500 font-semibold w-24 min-w-[96px]">Hole</th>
                {sortedHoles.map((h) => (
                  <th key={h.hole_number} className="px-1 py-1.5 text-center font-semibold text-gray-500 w-9">
                    {h.hole_number}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-100/60">
                <td className="sticky left-0 bg-gray-100/60 z-10 px-2 py-1 text-gray-400 font-medium">Par</td>
                {sortedHoles.map((h) => (
                  <td key={h.hole_number} className="px-1 py-1 text-center text-gray-400 font-medium">{h.par}</td>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                <td className="sticky left-0 bg-gray-50/50 z-10 px-2 py-1 text-gray-400 font-medium">Hdcp</td>
                {sortedHoles.map((h) => (
                  <td key={h.hole_number} className="px-1 py-1 text-center text-gray-300 font-medium">{h.handicap_index || "—"}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorers.map((scorer, idx) => {
                const handicap = scorerType === "pair"
                  ? pairHandicapMap.get(scorer.id) || 0
                  : playerHandicapMap.get(scorer.id) || 0;
                const color = scorer.team === 1 ? team1Color : team2Color;
                return (
                  <tr key={scorer.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} style={{ borderLeft: `3px solid ${color}` }}>
                    <td className={`sticky left-0 z-10 px-2 py-1.5 font-medium text-gray-700 truncate max-w-[96px] ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`} style={{ borderLeft: `3px solid ${color}` }}>
                      <div className="truncate text-[11px]">{scorer.name}</div>
                      {handicap > 0 && <div className="text-[9px] text-gray-400">HC: {handicap}</div>}
                    </td>
                    {sortedHoles.map((h) => {
                      const gross = scoreLookup.get(`${scorerType}-${scorer.id}-${h.hole_number}`);
                      const strokes = getStrokesOnHole(handicap, h.handicap_index);
                      const net = gross !== undefined ? gross - strokes : undefined;
                      return (
                        <td key={h.hole_number} className="px-0.5 py-0.5 text-center relative">
                          {strokes > 0 && (
                            <div className="absolute top-0 inset-x-0 flex justify-center gap-px">
                              {Array.from({ length: strokes }).map((_, i) => (
                                <span key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
                              ))}
                            </div>
                          )}
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min={1}
                            max={20}
                            value={gross ?? ""}
                            onChange={(e) => onScoreChange(foursome.id, h.hole_number, scorerType, scorer.id, e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={(e) => e.target.select()}
                            className={`w-8 h-7 text-center border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] ${scoreColor(gross, h.par)}`}
                          />
                          {net !== undefined && strokes > 0 && (
                            <div className={`text-[9px] ${scoreColor(net, h.par)}`}>{net}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Match summary for selected foursome
  const renderMatchSummary = () => {
    if (!result) return null;

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Match Summary</p>
        </div>
        <div className="divide-y divide-gray-100">
          {result.matches.map((m) => (
            <div key={m.matchIndex} className="flex items-center justify-between px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700">
                  {m.section === 3 ? "Scramble" : `Match ${m.matchIndex + 1}`}: {m.label}
                </p>
                <p className="text-[10px] text-gray-400">Section {m.section} (Holes {(m.section - 1) * 6 + 1}-{m.section * 6})</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold" style={{
                  color: m.sectionWinner === "team1" ? team1Color :
                         m.sectionWinner === "team2" ? team2Color :
                         m.sectionWinner === "halved" ? "#6b7280" : "#9ca3af"
                }}>
                  {formatMatchStatus(m)}
                </p>
                {m.sectionWinner !== "incomplete" && (
                  <p className="text-[10px] text-gray-400">
                    {m.team1Points} - {m.team2Points}
                  </p>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
            <p className="text-xs font-bold text-gray-700">Group Total</p>
            <p className="text-sm font-bold text-gray-900">
              <span style={{ color: team1Color }}>{result.team1TotalPoints}</span>
              {" — "}
              <span style={{ color: team2Color }}>{result.team2TotalPoints}</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderSectionGrid(1, "Section 1 — Holes 1-6 (Individual)", individualPlayers, "player")}
      {renderSectionGrid(2, "Section 2 — Holes 7-12 (Individual)", individualPlayers, "player")}
      {renderSectionGrid(3, "Section 3 — Holes 13-18 (Scramble)", scramblePairs, "pair")}
      {renderMatchSummary()}
    </div>
  );
}

function scoreColor(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-400";
  if (strokes < par) return "text-green-700 font-bold";
  if (strokes > par) return "text-red-600 font-bold";
  return "text-gray-900";
}

// ── Results Tab ──

function ResultsTab({
  teams,
  foursomes,
  pairs,
  foursomeResults,
  overall,
}: {
  teams: TeamInfo[];
  foursomes: FoursomeInfo[];
  pairs: PairInfo[];
  foursomeResults: FoursomeResult[];
  overall: ReturnType<typeof computeOverallResults>;
  getFoursomeLabel?: (f: FoursomeInfo) => string;
}) {
  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);
  const t1Color = getTeamColor(teams, 1);
  const t2Color = getTeamColor(teams, 2);

  const groups: KgbGroupData[] = foursomes.map((f) => {
    const pair1 = pairs.find((p) => p.id === f.pair_team1_id);
    const pair2 = pairs.find((p) => p.id === f.pair_team2_id);
    const p1a = pair1?.player_a?.display_name || "?";
    const p1b = pair1?.player_b?.display_name || "";
    const p2a = pair2?.player_a?.display_name || "?";
    const p2b = pair2?.player_b?.display_name || "";
    return {
      id: f.id,
      sort_order: f.sort_order || 0,
      team1PairLabel: p1b ? `${p1a} & ${p1b}` : p1a,
      team2PairLabel: p2b ? `${p2a} & ${p2b}` : p2a,
      results: foursomeResults.find((r) => r.foursomeId === f.id)!,
    };
  }).filter((g) => g.results);

  return (
    <div className="space-y-4">
      <KgbCupScoreboard
        team1={{ team_number: 1, team_name: team1?.team_name || "Team 1", team_color: t1Color }}
        team2={{ team_number: 2, team_name: team2?.team_name || "Team 2", team_color: t2Color }}
        overall={overall}
      />
      <KgbCupGroupResults groups={groups} team1Color={t1Color} team2Color={t2Color} />
    </div>
  );
}

