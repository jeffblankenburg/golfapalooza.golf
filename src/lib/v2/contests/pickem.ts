/**
 * Pick'em scoring (ports v1 src/lib/pickem/rankings.ts to v2). "Whitey's Pick'em":
 * college-football games picked against the spread, one tiebreaker game (guess total
 * points). The whole slate locks at the earliest kickoff.
 *
 * Spread convention here: `spread` is a POSITIVE magnitude and `favorite` says which
 * side it applies to. A pick is correct if the chosen side covered.
 */

export interface PickemGame {
  id: string;
  away_team: string;
  home_team: string;
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

/** Did a pick cover the spread? null until the game is scored. */
export function pickIsCorrect(g: PickemGame, picked: "away" | "home" | null): boolean | null {
  if (!gameIsScored(g) || !picked) return null;
  const margin = (g.home_score as number) - (g.away_score as number); // + = home won by
  const spread = Math.abs(Number(g.spread ?? 0));
  const homeSpread = g.favorite === "home" ? -spread : spread; // home favored → must win by > spread
  const homeCovers = margin + homeSpread > 0;
  return picked === "home" ? homeCovers : !homeCovers;
}

/** Build the leaderboard: correct DESC, then closest tiebreaker (a filled tiebreaker beats none). */
export function rankPickem(games: PickemGame[], picks: PickemPick[]): PickemLeaderRow[] {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const tb = games.find((g) => g.is_tiebreaker) || null;
  const tbActual = tb && gameIsScored(tb) ? (tb.away_score as number) + (tb.home_score as number) : null;

  const byUser = new Map<string, PickemPick[]>();
  for (const p of picks) (byUser.get(p.user_id) || byUser.set(p.user_id, []).get(p.user_id)!).push(p);

  const rows: PickemLeaderRow[] = [...byUser.entries()].map(([userId, ups]) => {
    let correct = 0, decided = 0, pickedCount = 0;
    let tiebreakerTotal: number | null = null;
    for (const p of ups) {
      const g = gameById.get(p.game_id);
      if (!g) continue;
      if (p.picked_team) pickedCount += 1;
      if (g.is_tiebreaker && p.tiebreaker_total != null) tiebreakerTotal = p.tiebreaker_total;
      if (gameIsScored(g) && p.picked_team) {
        decided += 1;
        if (pickIsCorrect(g, p.picked_team)) correct += 1;
      }
    }
    const tiebreakerDiff = tiebreakerTotal != null && tbActual != null ? Math.abs(tiebreakerTotal - tbActual) : null;
    return { userId, correct, decided, pickedCount, tiebreakerTotal, tiebreakerDiff, rank: 0 };
  });

  rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.tiebreakerDiff != null && b.tiebreakerDiff != null) return a.tiebreakerDiff - b.tiebreakerDiff;
    if (a.tiebreakerDiff != null) return -1; // a has a tiebreaker, b doesn't → a higher
    if (b.tiebreakerDiff != null) return 1;
    return 0;
  });

  // Dense-ish ranks: ties share a rank; the next distinct score takes its position index.
  rows.forEach((r, i) => {
    if (i === 0) { r.rank = 1; return; }
    const prev = rows[i - 1];
    const tied = prev.correct === r.correct && prev.tiebreakerDiff === r.tiebreakerDiff;
    r.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}
