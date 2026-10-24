/**
 * Shared slate substrate (#224). The contest-scoped matchup + pick layer every
 * pick-and-grade contest sits on (straight picks, confidence, parlays, props,
 * round-by-round bracket). Storage is generic (v2_matchups / v2_picks); each
 * contest type supplies only a pure ranker. This module is pure data — the row
 * mappers live in each contest's data layer (e.g. pickem-server.ts).
 *
 * Spread convention (ports pickem): `spread` is a POSITIVE magnitude and `favorite`
 * says which competitor ('a'|'b') it applies to; 'a' is the away/first side, 'b' the
 * home/second. A pick covers if the chosen side beat the line.
 */

export interface Competitor {
  name: string;
  espn_id?: string | null;
  seed?: number | null;
  region?: string | null;
  logo?: string | null;
  color?: string | null;
}

export interface MatchupResult {
  winner: "a" | "b" | null; // null = push (margin lands on the line / tie)
  score_a: number | null;
  score_b: number | null;
}

export interface Matchup {
  id: string;
  slot: string;
  round: string | null;
  sortOrder: number;
  competitorA: Competitor;
  competitorB: Competitor;
  startTime: string | null;
  spread: number | null;
  favorite: "a" | "b" | null;
  overUnder: number | null;
  status: "scheduled" | "in_progress" | "final";
  result: MatchupResult | null;
  isTiebreaker: boolean;
}

/** One table serves every type; only the relevant key is set. */
export interface PickValue {
  side?: "a" | "b";        // straight / bracket
  ats?: "a" | "b";         // against the spread
  ou?: "over" | "under";   // over/under
  weight?: number;         // confidence
}

export interface Pick {
  matchupId: string;
  userId: string;
  pick: PickValue | null;
  tiebreaker: number | null;
}

export interface LeaderRow {
  userId: string;
  correct: number;              // covered picks on decided games
  decided: number;              // picks on decided (non-push) games
  pickedCount: number;          // games they made any pick on
  points?: number;              // weighted total (confidence); absent for straight
  tiebreaker: number | null;
  tiebreakerDiff: number | null; // |their total − actual|, once the tiebreaker game is scored
  rank: number;
}

/** Both scores are in (ready to grade). */
export function matchupScored(m: Matchup): boolean {
  return !!m.result && m.result.score_a != null && m.result.score_b != null;
}

/** The earliest kickoff — the whole slate locks then. */
export function slateLockAt(matchups: Matchup[]): string | null {
  const times = matchups.map((m) => m.startTime).filter((t): t is string => !!t).sort();
  return times[0] ?? null;
}
export function isLocked(matchups: Matchup[], now: Date): boolean {
  const lock = slateLockAt(matchups);
  return lock != null && now.getTime() >= new Date(lock).getTime();
}

/**
 * Which side COVERED once scored — 'a' | 'b', or null (unscored, or a push / no-line
 * tie). A no-line matchup (spread/favorite null) grades straight-up. 'b' is the home/
 * second side, matching the pickem convention.
 */
export function coveringSide(m: Matchup): "a" | "b" | null {
  if (!matchupScored(m)) return null;
  const margin = (m.result!.score_b as number) - (m.result!.score_a as number); // + = b won by
  const spread = Math.abs(Number(m.spread ?? 0));
  const bSpread = m.favorite === "b" ? -spread : spread; // b favored → must win by > spread
  const adjusted = margin + bSpread;
  if (adjusted === 0) return null; // push
  return adjusted > 0 ? "b" : "a";
}

/**
 * Did a pick win? null until decided (unscored, or a push). Straight/ATS compare the
 * chosen side to the covering side; O/U compares the total to the line.
 */
export function pickIsCorrect(m: Matchup, pick: PickValue | null): boolean | null {
  if (!pick) return null;
  if (pick.ou) {
    if (!matchupScored(m) || m.overUnder == null) return null;
    const total = (m.result!.score_a as number) + (m.result!.score_b as number);
    if (total === m.overUnder) return null; // push
    return total > m.overUnder === (pick.ou === "over");
  }
  const side = coveringSide(m);
  const chosen = pick.side ?? pick.ats ?? null;
  if (!chosen || side === null) return null;
  return chosen === side;
}

/** A ranker is a pure function per contest type. */
export type Ranker = (matchups: Matchup[], picks: Pick[], config?: unknown) => LeaderRow[];

function tiebreakerActual(matchups: Matchup[]): number | null {
  const tb = matchups.find((m) => m.isTiebreaker) || null;
  return tb && matchupScored(tb) ? (tb.result!.score_a as number) + (tb.result!.score_b as number) : null;
}

function picksByUser(picks: Pick[]): Map<string, Pick[]> {
  const byUser = new Map<string, Pick[]>();
  for (const p of picks) (byUser.get(p.userId) || byUser.set(p.userId, []).get(p.userId)!).push(p);
  return byUser;
}

/** correct DESC, then closest tiebreaker (a filled tiebreaker beats none); dense-ish ranks. */
function applyRanks(rows: LeaderRow[]): LeaderRow[] {
  rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.tiebreakerDiff != null && b.tiebreakerDiff != null) return a.tiebreakerDiff - b.tiebreakerDiff;
    if (a.tiebreakerDiff != null) return -1;
    if (b.tiebreakerDiff != null) return 1;
    return 0;
  });
  rows.forEach((r, i) => {
    if (i === 0) { r.rank = 1; return; }
    const prev = rows[i - 1];
    const tied = prev.correct === r.correct && prev.tiebreakerDiff === r.tiebreakerDiff;
    r.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}

/**
 * Straight / ATS leaderboard (ports rankPickem): correct count on decided games, with
 * the tiebreaker game breaking ties by closeness to the actual total.
 */
export const rankStraight: Ranker = (matchups, picks) => {
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const tbActual = tiebreakerActual(matchups);
  const rows: LeaderRow[] = [...picksByUser(picks).entries()].map(([userId, ups]) => {
    let correct = 0, decided = 0, pickedCount = 0;
    let tiebreaker: number | null = null;
    for (const p of ups) {
      const m = byId.get(p.matchupId);
      if (!m) continue;
      const chosen = p.pick?.side ?? p.pick?.ats ?? null;
      if (chosen) pickedCount += 1;
      if (m.isTiebreaker && p.tiebreaker != null) tiebreaker = p.tiebreaker;
      if (matchupScored(m) && chosen) {
        const result = pickIsCorrect(m, p.pick);
        if (result !== null) { decided += 1; if (result) correct += 1; }
      }
    }
    const tiebreakerDiff = tiebreaker != null && tbActual != null ? Math.abs(tiebreaker - tbActual) : null;
    return { userId, correct, decided, pickedCount, tiebreaker, tiebreakerDiff, rank: 0 };
  });
  return applyRanks(rows);
};

/**
 * Confidence leaderboard: each pick carries a weight; a correct pick scores its weight.
 * Rank by points (surfaced as `correct` too, so the shared sort/tiebreak applies).
 */
export const rankConfidence: Ranker = (matchups, picks) => {
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const tbActual = tiebreakerActual(matchups);
  const rows: LeaderRow[] = [...picksByUser(picks).entries()].map(([userId, ups]) => {
    let points = 0, decided = 0, pickedCount = 0;
    let tiebreaker: number | null = null;
    for (const p of ups) {
      const m = byId.get(p.matchupId);
      if (!m) continue;
      const chosen = p.pick?.side ?? p.pick?.ats ?? null;
      if (chosen) pickedCount += 1;
      if (m.isTiebreaker && p.tiebreaker != null) tiebreaker = p.tiebreaker;
      if (matchupScored(m) && chosen) {
        const result = pickIsCorrect(m, p.pick);
        if (result !== null) { decided += 1; if (result) points += Math.max(0, Number(p.pick?.weight) || 0); }
      }
    }
    const tiebreakerDiff = tiebreaker != null && tbActual != null ? Math.abs(tiebreaker - tbActual) : null;
    return { userId, correct: points, decided, pickedCount, points, tiebreaker, tiebreakerDiff, rank: 0 };
  });
  return applyRanks(rows);
};
