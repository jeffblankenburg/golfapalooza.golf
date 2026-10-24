/**
 * Pick'em scoring (ports v1 src/lib/pickem/rankings.ts to v2). "Whitey's Pick'em":
 * college-football games picked against the spread, one tiebreaker game (guess total
 * points). The whole slate locks at the earliest kickoff.
 *
 * Spread convention here: `spread` is a POSITIVE magnitude and `favorite` says which
 * side it applies to. A pick is correct if the chosen side covered.
 */

import { rankStraight, type Matchup, type Pick as SlatePick } from "./slate";

export interface PickemGame {
  id: string;
  away_team: string;
  home_team: string;
  away_abbrev: string | null; // ESPN short code (e.g. "UVA"); null for manual games
  home_abbrev: string | null;
  away_logo_url: string | null;
  home_logo_url: string | null;
  away_color: string | null;
  home_color: string | null;
  spread: number | null;
  favorite: "away" | "home" | null;
  game_time: string | null;
  tv_channel: string | null;
  is_tiebreaker: boolean;
  winning_team: "away" | "home" | null;
  away_score: number | null;
  home_score: number | null;
  sort_order: number;
}

/** A side's short label: the ESPN abbreviation when we have it, else the full
 *  name (manually-added games carry no abbreviation). */
export function pickemTeamLabel(
  g: { away_team: string; home_team: string; away_abbrev?: string | null; home_abbrev?: string | null },
  side: "away" | "home",
): string {
  const abbrev = side === "away" ? g.away_abbrev : g.home_abbrev;
  const full = side === "away" ? g.away_team : g.home_team;
  return (abbrev || "").trim() || full;
}

export interface PickemPick {
  game_id: string;
  user_id: string;
  picked_team: "away" | "home" | null;
  tiebreaker_total: number | null;
}

export interface PickemLeaderRow {
  userId: string;
  correct: number;      // picks that covered, on scored games
  decided: number;      // picks on scored games
  pickedCount: number;  // games they made any pick on
  tiebreakerTotal: number | null;
  tiebreakerDiff: number | null; // |their total − actual|, once the tiebreaker game is scored
  rank: number;
}

// Pot-split math now lives in the shared payout engine; re-export under the old names.
export { computePlacePayouts as computePickemPayouts, type PayoutSplit, type PlacePayout as PickemPayout } from "./payouts";

export const gameIsScored = (g: PickemGame): boolean => g.away_score != null && g.home_score != null;

/** The earliest kickoff — the whole slate locks then. */
export function slateLockAt(games: PickemGame[]): string | null {
  const times = games.map((g) => g.game_time).filter((t): t is string => !!t).sort();
  return times[0] ?? null;
}
export function isSlateLocked(games: PickemGame[], now: Date): boolean {
  const lock = slateLockAt(games);
  return lock != null && now.getTime() >= new Date(lock).getTime();
}

/**
 * Did a pick cover the spread? null until the game is scored. A no-line game
 * (`spread`/`favorite` null) grades straight-up. A PUSH — the margin lands exactly
 * on the line, including a no-line tie — returns null: nobody is credited or dinged.
 */
export function pickIsCorrect(g: PickemGame, picked: "away" | "home" | null): boolean | null {
  const side = coveringSide(g);
  if (!picked || side === null) return null;
  return picked === side;
}

/**
 * Which side COVERED the spread once the game is scored — "away" | "home", or null
 * (unscored, or a push / no-line tie where nobody covered). Same math as
 * pickIsCorrect; use it to highlight the winning team on a completed game.
 */
export function coveringSide(g: PickemGame): "away" | "home" | null {
  if (!gameIsScored(g)) return null;
  const margin = (g.home_score as number) - (g.away_score as number); // + = home won by
  const spread = Math.abs(Number(g.spread ?? 0));
  const homeSpread = g.favorite === "home" ? -spread : spread; // home favored → must win by > spread
  const adjusted = margin + homeSpread;
  if (adjusted === 0) return null; // push
  return adjusted > 0 ? "home" : "away";
}

/**
 * Build the leaderboard: correct DESC, then closest tiebreaker (a filled tiebreaker
 * beats none). A thin adapter over the shared `rankStraight` substrate ranker (#224):
 * map the flat Pick'em game/pick shape to generic matchups/picks (away→'a', home→'b'),
 * rank, and map the rows back. One ranker, many contest types.
 */
export function rankPickem(games: PickemGame[], picks: PickemPick[]): PickemLeaderRow[] {
  const matchups: Matchup[] = games.map((g) => ({
    id: g.id, slot: g.id, round: null, sortOrder: g.sort_order,
    competitorA: { name: g.away_team }, competitorB: { name: g.home_team },
    startTime: g.game_time, spread: g.spread,
    favorite: g.favorite === "away" ? "a" : g.favorite === "home" ? "b" : null,
    overUnder: null,
    status: g.away_score != null && g.home_score != null ? "final" : "scheduled",
    result: g.away_score != null && g.home_score != null
      ? { winner: g.winning_team === "away" ? "a" : g.winning_team === "home" ? "b" : null, score_a: g.away_score, score_b: g.home_score }
      : null,
    isTiebreaker: g.is_tiebreaker,
  }));
  const slatePicks: SlatePick[] = picks.map((p) => ({
    matchupId: p.game_id, userId: p.user_id,
    pick: p.picked_team === "away" ? { side: "a" } : p.picked_team === "home" ? { side: "b" } : null,
    tiebreaker: p.tiebreaker_total,
  }));
  return rankStraight(matchups, slatePicks).map((r) => ({
    userId: r.userId, correct: r.correct, decided: r.decided, pickedCount: r.pickedCount,
    tiebreakerTotal: r.tiebreaker, tiebreakerDiff: r.tiebreakerDiff, rank: r.rank,
  }));
}
