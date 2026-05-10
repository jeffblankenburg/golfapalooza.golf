/**
 * Pickem standings / rankings — extracted from
 * `src/app/api/admin/pickem/results/route.ts` so both that API and the
 * winners materializer (issue #124) can share the same scoring logic.
 *
 * Standings:
 *   1. Sort by `correct` desc.
 *   2. Tiebreak by `tiebreaker_diff` asc (closest tiebreaker_total wins).
 *   3. Picks with no tiebreaker submitted lose to picks with one.
 *   4. Ranks may include ties (two users with identical correct + tiebreaker_diff
 *      share a rank; the next user gets `index + 1`, not `prev_rank + 1`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface PickemRanking {
  user_id: string;
  display_name: string;
  rank: number;
  correct: number;
  total: number;
  decided: number;
  tiebreaker_total: number | null;
  tiebreaker_diff: number | null;
}

interface Game {
  id: string;
  favorite: string;
  spread: number;
  away_score: number | null;
  home_score: number | null;
  winning_team: string | null;
  is_tiebreaker: boolean | null;
  pickem_picks?: Pick[];
}

interface Pick {
  user_id: string;
  picked_team: string;
  tiebreaker_total: number | null;
}

function isPickCorrect(pick: Pick, game: Game): boolean | null {
  if (!game.winning_team || game.away_score === null || game.home_score === null) {
    return null;
  }
  const margin = game.home_score - game.away_score;
  const homeSpread = game.favorite === "home" ? game.spread : -game.spread;
  const homeCovers = margin + homeSpread > 0;
  return pick.picked_team === "home" ? homeCovers : !homeCovers;
}

export async function computePickemRankings(
  client: Client,
  contestId: string,
): Promise<PickemRanking[]> {
  const [gamesRes, participantsRes] = await Promise.all([
    client
      .from("pickem_games")
      .select("*, pickem_picks(*)")
      .eq("contest_id", contestId)
      .order("sort_order"),
    client
      .from("contest_participants")
      .select(
        "user_id, user:users!contest_participants_user_id_fkey(display_name)",
      )
      .eq("contest_id", contestId),
  ]);

  const games = (gamesRes.data || []) as Game[];
  const participants = (participantsRes.data || []).map((p) => {
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    const user = u as { display_name?: string } | null;
    return {
      user_id: p.user_id,
      display_name: user?.display_name || "Unknown",
    };
  });

  const tiebreakerGame = games.find((g) => g.is_tiebreaker);
  const tiebreakerActualTotal =
    tiebreakerGame &&
    tiebreakerGame.away_score !== null &&
    tiebreakerGame.home_score !== null
      ? tiebreakerGame.away_score + tiebreakerGame.home_score
      : null;

  const standings = participants.map((p) => {
    let correct = 0;
    let total = 0;
    let decided = 0;
    let tiebreakerTotal: number | null = null;

    for (const game of games) {
      const picks = (game.pickem_picks || []) as Pick[];
      const pick = picks.find((pk) => pk.user_id === p.user_id);
      if (!pick) continue;
      total++;
      const result = isPickCorrect(pick, game);
      if (result !== null) {
        decided++;
        if (result) correct++;
      }
      if (game.is_tiebreaker && pick.tiebreaker_total !== null) {
        tiebreakerTotal = pick.tiebreaker_total;
      }
    }

    const tiebreakerDiff =
      tiebreakerTotal !== null && tiebreakerActualTotal !== null
        ? Math.abs(tiebreakerTotal - tiebreakerActualTotal)
        : null;

    return {
      ...p,
      correct,
      total,
      decided,
      tiebreaker_total: tiebreakerTotal,
      tiebreaker_diff: tiebreakerDiff,
    };
  });

  standings.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.tiebreaker_diff !== null && b.tiebreaker_diff !== null) {
      return a.tiebreaker_diff - b.tiebreaker_diff;
    }
    if (a.tiebreaker_diff !== null) return -1;
    if (b.tiebreaker_diff !== null) return 1;
    return 0;
  });

  let rank = 1;
  const ranked: PickemRanking[] = [];
  for (let i = 0; i < standings.length; i++) {
    if (i > 0) {
      const prev = standings[i - 1];
      const curr = standings[i];
      if (
        curr.correct !== prev.correct ||
        curr.tiebreaker_diff !== prev.tiebreaker_diff
      ) {
        rank = i + 1;
      }
    }
    ranked.push({ ...standings[i], rank });
  }
  return ranked;
}
