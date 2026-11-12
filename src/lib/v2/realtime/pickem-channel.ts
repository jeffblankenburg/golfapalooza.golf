"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * One channel per Pick'em contest. Any change that affects the member board fires
 * `onChange`: a game scored or its line moved (v2_matchups), someone's pick landing
 * (v2_picks), the prize structure / lock mode changing (v2_contests.payout_splits /
 * config), or an entrant joining/leaving (v2_contest_participants → pot = entry × entrants).
 * Callers just `router.refresh()` and the server recomputes the whole board (standings +
 * pot + projected winnings). No polling — every input is published. Returns an unsubscribe.
 *
 * All four tables are REPLICA IDENTITY FULL, so the contest_id/id filters match on DELETE
 * too (a game removed, picks reset, a member leaving), not just INSERT/UPDATE.
 */
export function subscribeToPickem(contestId: string, onChange: () => void): () => void {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(`v2-pickem:${contestId}`);

  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_matchups", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_picks", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_contests", filter: `id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_contest_participants", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.subscribe();

  return () => { void supabase.removeChannel(channel); };
}
