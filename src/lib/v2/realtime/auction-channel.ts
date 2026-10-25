"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * One channel per auction. Any change that affects the board — a lot assigned/undone
 * (v2_auction_teams), the lot put on the block / the auction closed (v2_contests.config),
 * or a game grading (v2_tournament_games → points/champion) — fires `onChange`. Callers
 * just `router.refresh()`; the server recomputes the whole board. Returns an unsubscribe.
 */
export function subscribeToAuction(
  contestId: string, tournamentId: string | null, onChange: () => void,
): () => void {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(`v2-auction:${contestId}`);

  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_auction_teams", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_contests", filter: `id=eq.${contestId}` }, onChange);
  if (tournamentId) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_tournament_games", filter: `tournament_id=eq.${tournamentId}` }, onChange);
  }
  channel.subscribe();

  return () => { void supabase.removeChannel(channel); };
}
