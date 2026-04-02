/**
 * BSPITW winner resolution.
 * Auto-resolves if clear winner; returns tie info if admin must declare playoff winner.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { computeBspitwLeaderboard } from "./bspitw-scoring";

export interface BspitwResult {
  resolved: boolean;
  userIds?: string[];
  tied?: boolean;
  tiedUserIds?: string[];
  tiedPoints?: number;
}

/**
 * Attempt to resolve the BSPITW winner for a trip.
 * Returns resolved=true with the winner, or tied=true with the tied players.
 */
export async function resolveBspitwWinner(
  supabase: SupabaseClient,
  tripId: string
): Promise<BspitwResult> {
  const leaderboard = await computeBspitwLeaderboard(supabase, tripId);

  if (leaderboard.length === 0) {
    return { resolved: false };
  }

  if (leaderboard.length === 1) {
    return { resolved: true, userIds: [leaderboard[0].user_id] };
  }

  const topPoints = leaderboard[0].total_points;
  const tiedAtTop = leaderboard.filter((p) => p.total_points === topPoints);

  if (tiedAtTop.length === 1) {
    return { resolved: true, userIds: [tiedAtTop[0].user_id] };
  }

  // Tie — admin must declare playoff winner
  return {
    resolved: false,
    tied: true,
    tiedUserIds: tiedAtTop.map((p) => p.user_id),
    tiedPoints: topPoints,
  };
}
