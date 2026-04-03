/**
 * KGB Cup match play logic.
 *
 * Pure functions — no DB calls. Importable by API routes and client components.
 *
 * Structure:
 *   - 9 foursomes (or threesomes), each with one pair from Team 1 vs one pair from Team 2
 *   - Section 1 (holes 1-6):  Match 0 = T1-A vs T2-A,  Match 1 = T1-B vs T2-B
 *   - Section 2 (holes 7-12): Match 2 = T1-A vs T2-B,  Match 3 = T1-B vs T2-A
 *   - Section 3 (holes 13-18): Match 4 = T1-Pair vs T2-Pair (scramble)
 *   - Each section: count hole wins → section winner gets 1pt, tie = 0.5 each
 *   - First to majority wins (clinch = ceil(totalSections / 2))
 */

// ── Types ──

export interface PlayerHandicap {
  playerId: string;
  originalHandicap: number | null; // null = scratch (0)
  adjustedHandicap: number;
}

export interface PairHandicap {
  pairId: string;
  scrambleHandicap: number;
}

export interface HoleInfo {
  hole_number: number;
  par: number;
  handicap_index: number;
}

export interface HoleScore {
  foursome_id: string;
  hole_number: number;
  scorer_type: "player" | "pair";
  scorer_id: string;
  strokes: number;
}

export interface FoursomeData {
  id: string;
  pair_team1_id: string;
  pair_team2_id: string;
  team1_player_a_id: string | null;
  team1_player_b_id: string | null;
  team2_player_a_id: string | null;
  team2_player_b_id: string | null;
}

export interface MatchResult {
  matchIndex: number; // 0-4
  section: 1 | 2 | 3;
  label: string; // e.g. "Quack vs Spanky"
  team1ScorerName: string; // display name(s) for team1 scorer
  team2ScorerName: string; // display name(s) for team2 scorer
  team1ScorerId: string; // player_id or pair_id
  team2ScorerId: string;
  scorerType: "player" | "pair";
  holeResults: {
    hole: number;
    team1Net: number | null;
    team2Net: number | null;
    winner: "team1" | "team2" | "tie" | null; // null = not scored
  }[];
  team1Wins: number;
  team2Wins: number;
  ties: number;
  holesPlayed: number;
  sectionWinner: "team1" | "team2" | "halved" | "incomplete";
  team1Points: number;
  team2Points: number;
}

export interface FoursomeResult {
  foursomeId: string;
  matches: MatchResult[];
  team1TotalPoints: number;
  team2TotalPoints: number;
}

export interface OverallResult {
  team1Points: number;
  team2Points: number;
  totalSections: number;
  completedSections: number;
  winner: "team1" | "team2" | "tied" | "incomplete";
}

// ── Handicap Functions ──

/**
 * Compute adjusted handicaps: subtract the lowest handicap from all players.
 * Players with null handicap are treated as scratch (0).
 */
export function computeAdjustedHandicaps(
  players: { playerId: string; handicapIndex: number | null }[]
): PlayerHandicap[] {
  const withValues = players.map((p) => ({
    playerId: p.playerId,
    original: p.handicapIndex ?? 0,
  }));

  const lowest = Math.min(...withValues.map((p) => p.original));

  return withValues.map((p) => ({
    playerId: p.playerId,
    originalHandicap: players.find((pp) => pp.playerId === p.playerId)!.handicapIndex,
    adjustedHandicap: Math.round(p.original - lowest),
  }));
}

/**
 * Get the number of strokes a player receives on a specific hole.
 * Strokes go to hardest holes first (handicap_index 1 = hardest).
 */
export function getStrokesOnHole(
  adjustedHandicap: number,
  holeHandicapIndex: number,
  totalHoles: number = 18
): number {
  if (adjustedHandicap <= 0) return 0;

  const fullPasses = Math.floor(adjustedHandicap / totalHoles);
  const remainder = adjustedHandicap % totalHoles;

  // handicap_index 1 = hardest = gets strokes first
  // If holeHandicapIndex <= remainder, gets an extra stroke
  return fullPasses + (holeHandicapIndex <= remainder ? 1 : 0);
}

/**
 * Get strokes on a hole for a section (6-hole subset).
 * Re-ranks holes 1-6 by difficulty within the section.
 */
export function getStrokesOnHoleInSection(
  adjustedHandicap: number,
  holeNumber: number,
  sectionHoles: HoleInfo[]
): number {
  if (adjustedHandicap <= 0) return 0;

  // Rank holes within this section by handicap_index (ascending = hardest first)
  const ranked = [...sectionHoles].sort((a, b) => a.handicap_index - b.handicap_index);
  const rank = ranked.findIndex((h) => h.hole_number === holeNumber) + 1; // 1-based

  if (rank === 0) return 0;

  const sectionSize = sectionHoles.length;
  const fullPasses = Math.floor(adjustedHandicap / sectionSize);
  const remainder = adjustedHandicap % sectionSize;

  return fullPasses + (rank <= remainder ? 1 : 0);
}

/**
 * Get net score: gross minus strokes received.
 * Uses 18-hole distribution — strokes go to the hardest holes by course handicap index.
 */
export function getNetScore(
  gross: number,
  adjustedHandicap: number,
  holeHandicapIndex: number,
): number {
  const strokes = getStrokesOnHole(adjustedHandicap, holeHandicapIndex);
  return gross - strokes;
}

// ── Foursome Helpers ──

/**
 * Check if a foursome is a threesome (one pair has a null player_b).
 */
export function isThreesome(foursome: FoursomeData): boolean {
  return foursome.team1_player_b_id === null || foursome.team2_player_b_id === null;
}

/**
 * Get section holes for a given section number.
 */
export function getSectionHoles(allHoles: HoleInfo[], section: 1 | 2 | 3): HoleInfo[] {
  switch (section) {
    case 1: return allHoles.filter((h) => h.hole_number >= 1 && h.hole_number <= 6);
    case 2: return allHoles.filter((h) => h.hole_number >= 7 && h.hole_number <= 12);
    case 3: return allHoles.filter((h) => h.hole_number >= 13 && h.hole_number <= 18);
  }
}

// ── Match Computation ──

/**
 * Compute all 5 match results for a foursome group.
 */
export function computeFoursomeResult(
  foursome: FoursomeData,
  scores: HoleScore[],
  playerHandicaps: Map<string, number>, // player_id -> adjusted handicap
  pairHandicaps: Map<string, number>,   // pair_id -> scramble handicap
  holes: HoleInfo[],
  playerNames?: Map<string, string>,    // player_id -> display_name
): FoursomeResult {
  const foursomeScores = scores.filter((s) => s.foursome_id === foursome.id);

  // Build score lookup: `${scorer_type}-${scorer_id}-${hole_number}` -> strokes
  const scoreLookup = new Map<string, number>();
  for (const s of foursomeScores) {
    scoreLookup.set(`${s.scorer_type}-${s.scorer_id}-${s.hole_number}`, s.strokes);
  }

  const t1a = foursome.team1_player_a_id;
  const t1b = foursome.team1_player_b_id;
  const t2a = foursome.team2_player_a_id;
  const t2b = foursome.team2_player_b_id;

  const threesome = isThreesome(foursome);

  // Helper to get player display name (or fallback)
  const pn = (id: string | null, fallback: string): string => {
    if (!id) return fallback;
    return playerNames?.get(id) || fallback;
  };

  // Build pair label from two player names
  const pairLabel = (aId: string | null, bId: string | null, fallback: string): string => {
    if (!playerNames) return fallback;
    const names = [aId, bId].filter(Boolean).map((id) => playerNames.get(id!) || "?");
    return names.length > 0 ? names.join(" & ") : fallback;
  };

  // Define 5 matches
  const matchDefs: {
    matchIndex: number;
    section: 1 | 2 | 3;
    label: string;
    team1ScorerName: string;
    team2ScorerName: string;
    team1ScorerId: string;
    team2ScorerId: string;
    scorerType: "player" | "pair";
  }[] = [
    // Section 1 (holes 1-6)
    {
      matchIndex: 0, section: 1,
      label: `${pn(t1a, "T1-A")} vs ${pn(t2a, "T2-A")}`,
      team1ScorerName: pn(t1a, "T1-A"), team2ScorerName: pn(t2a, "T2-A"),
      team1ScorerId: t1a!, team2ScorerId: t2a!, scorerType: "player",
    },
    {
      matchIndex: 1, section: 1,
      label: `${pn(t1b, "T1-B")} vs ${pn(t2b, "T2-B")}`,
      team1ScorerName: pn(t1b, "T1-B"), team2ScorerName: pn(t2b, "T2-B"),
      // In threesome: solo player's score used for their team's B slot
      team1ScorerId: t1b || t1a!, team2ScorerId: t2b || t2a!, scorerType: "player",
    },
    // Section 2 (holes 7-12)
    {
      matchIndex: 2, section: 2,
      label: `${pn(t1a, "T1-A")} vs ${pn(t2b, "T2-B")}`,
      team1ScorerName: pn(t1a, "T1-A"), team2ScorerName: pn(t2b, "T2-B"),
      team1ScorerId: t1a!, team2ScorerId: t2b || t2a!, scorerType: "player",
    },
    {
      matchIndex: 3, section: 2,
      label: `${pn(t1b, "T1-B")} vs ${pn(t2a, "T2-A")}`,
      team1ScorerName: pn(t1b, "T1-B"), team2ScorerName: pn(t2a, "T2-A"),
      team1ScorerId: t1b || t1a!, team2ScorerId: t2a!, scorerType: "player",
    },
    // Section 3 (holes 13-18) — scramble
    {
      matchIndex: 4, section: 3,
      label: `${pairLabel(t1a, t1b, "T1-Pair")} vs ${pairLabel(t2a, t2b, "T2-Pair")}`,
      team1ScorerName: pairLabel(t1a, t1b, "T1-Pair"), team2ScorerName: pairLabel(t2a, t2b, "T2-Pair"),
      team1ScorerId: foursome.pair_team1_id, team2ScorerId: foursome.pair_team2_id, scorerType: "pair",
    },
  ];

  const matches: MatchResult[] = matchDefs.map((def) => {
    const sectionHoles = getSectionHoles(holes, def.section);

    const getHandicap = (scorerId: string, type: "player" | "pair"): number => {
      if (type === "pair") return pairHandicaps.get(scorerId) || 0;
      return playerHandicaps.get(scorerId) || 0;
    };

    const t1Handicap = getHandicap(def.team1ScorerId, def.scorerType);
    const t2Handicap = getHandicap(def.team2ScorerId, def.scorerType);

    const holeResults = sectionHoles
      .sort((a, b) => a.hole_number - b.hole_number)
      .map((hole) => {
        const t1Gross = scoreLookup.get(`${def.scorerType}-${def.team1ScorerId}-${hole.hole_number}`);
        const t2Gross = scoreLookup.get(`${def.scorerType}-${def.team2ScorerId}-${hole.hole_number}`);

        if (t1Gross === undefined || t2Gross === undefined) {
          return {
            hole: hole.hole_number,
            team1Net: t1Gross !== undefined ? getNetScore(t1Gross, t1Handicap, hole.handicap_index) : null,
            team2Net: t2Gross !== undefined ? getNetScore(t2Gross, t2Handicap, hole.handicap_index) : null,
            winner: null as "team1" | "team2" | "tie" | null,
          };
        }

        const t1Net = getNetScore(t1Gross, t1Handicap, hole.handicap_index);
        const t2Net = getNetScore(t2Gross, t2Handicap, hole.handicap_index);

        let winner: "team1" | "team2" | "tie";
        if (t1Net < t2Net) winner = "team1";
        else if (t2Net < t1Net) winner = "team2";
        else winner = "tie";

        return { hole: hole.hole_number, team1Net: t1Net, team2Net: t2Net, winner };
      });

    const scoredHoles = holeResults.filter((h) => h.winner !== null);
    const team1Wins = scoredHoles.filter((h) => h.winner === "team1").length;
    const team2Wins = scoredHoles.filter((h) => h.winner === "team2").length;
    const ties = scoredHoles.filter((h) => h.winner === "tie").length;
    const holesPlayed = scoredHoles.length;

    // Section complete when all 6 holes scored
    const isComplete = holesPlayed === sectionHoles.length;

    let sectionWinner: "team1" | "team2" | "halved" | "incomplete";
    let team1Points = 0;
    let team2Points = 0;

    if (!isComplete) {
      sectionWinner = "incomplete";
    } else if (team1Wins > team2Wins) {
      sectionWinner = "team1";
      team1Points = 1;
    } else if (team2Wins > team1Wins) {
      sectionWinner = "team2";
      team2Points = 1;
    } else {
      sectionWinner = "halved";
      team1Points = 0.5;
      team2Points = 0.5;
    }

    return {
      matchIndex: def.matchIndex,
      section: def.section,
      label: def.label,
      team1ScorerName: def.team1ScorerName,
      team2ScorerName: def.team2ScorerName,
      team1ScorerId: def.team1ScorerId,
      team2ScorerId: def.team2ScorerId,
      scorerType: def.scorerType,
      holeResults,
      team1Wins,
      team2Wins,
      ties,
      holesPlayed,
      sectionWinner,
      team1Points,
      team2Points,
    };
  });

  return {
    foursomeId: foursome.id,
    matches,
    team1TotalPoints: matches.reduce((sum, m) => sum + m.team1Points, 0),
    team2TotalPoints: matches.reduce((sum, m) => sum + m.team2Points, 0),
  };
}

/**
 * Compute overall results across all foursomes.
 */
export function computeOverallResults(
  foursomeResults: FoursomeResult[]
): OverallResult {
  let team1Points = 0;
  let team2Points = 0;
  let totalSections = 0;
  let completedSections = 0;

  for (const fr of foursomeResults) {
    for (const m of fr.matches) {
      totalSections++;
      if (m.sectionWinner !== "incomplete") {
        completedSections++;
        team1Points += m.team1Points;
        team2Points += m.team2Points;
      }
    }
  }

  const clinch = Math.ceil(totalSections / 2);
  let winner: "team1" | "team2" | "tied" | "incomplete";
  if (team1Points >= clinch) winner = "team1";
  else if (team2Points >= clinch) winner = "team2";
  else if (completedSections === totalSections && totalSections > 0) {
    if (team1Points > team2Points) winner = "team1";
    else if (team2Points > team1Points) winner = "team2";
    else winner = "tied";
  } else {
    winner = "incomplete";
  }

  return { team1Points, team2Points, totalSections, completedSections, winner };
}

/**
 * Format match status as a human-readable string.
 * e.g. "2 UP thru 4", "All Square thru 6", "HALVED"
 */
export function formatMatchStatus(match: MatchResult): string {
  const t1Name = match.team1ScorerName;
  const t2Name = match.team2ScorerName;

  if (match.sectionWinner === "incomplete") {
    if (match.holesPlayed === 0) return "Not started";
    const lead = Math.abs(match.team1Wins - match.team2Wins);
    if (lead === 0) return `All Square thru ${match.holesPlayed}`;
    const leader = match.team1Wins > match.team2Wins ? t1Name : t2Name;
    const totalHoles = match.holeResults.length;
    const remaining = totalHoles - match.holesPlayed;
    if (remaining > 0 && lead === remaining) {
      return `${leader} Dormie (${lead} UP, ${remaining} to play)`;
    }
    return `${leader} ${lead} UP thru ${match.holesPlayed}`;
  }

  if (match.sectionWinner === "halved") return "HALVED";
  const lead = Math.abs(match.team1Wins - match.team2Wins);
  const leader = match.sectionWinner === "team1" ? t1Name : t2Name;
  return `${leader} wins ${lead} UP`;
}
