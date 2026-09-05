import type { SupabaseClient } from "@supabase/supabase-js";

export interface ContestPick {
  game_id: string;
  user_id: string;
  picked_team: string;
  tiebreaker_total: number | null;
}

/**
 * Fetch every pick for a contest, paginating past PostgREST's hard 1000-row
 * cap.
 *
 * The original code did an UNFILTERED `select` of the entire pickem_picks table
 * and filtered by game_id in JS. Once the table crossed 1000 rows total, the
 * server silently returned only the first 1000 — and with no ORDER BY, the
 * dropped rows were arbitrary (often the most recently written). Users' saved
 * picks then failed to load and highlight, and admin pick counts were wrong.
 *
 * Scoping to the contest via an inner join on pickem_games keeps each page
 * small; the loop guarantees no silent truncation even if a single contest ever
 * exceeds 1000 picks.
 */
export async function fetchContestPicks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, "public", any>,
  contestId: string,
): Promise<ContestPick[]> {
  const pageSize = 1000;
  const all: ContestPick[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("pickem_picks")
      .select("game_id, user_id, picked_team, tiebreaker_total, pickem_games!inner(contest_id)")
      .eq("pickem_games.contest_id", contestId)
      .order("game_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as ContestPick[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
