"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * One channel per Props contest. Any change that affects the member board fires `onChange`:
 * a question added/edited/settled/voided (v2_prop_questions), an answer landing
 * (v2_prop_answers), the prize structure / lock changing (v2_contests), or an entrant
 * joining/leaving (v2_contest_participants → pot = entry × entrants). Callers just
 * `router.refresh()` and the server recomputes the board. Returns an unsubscribe.
 *
 * All four tables are REPLICA IDENTITY FULL, so the contest_id/id filters match DELETE too.
 */
export function subscribeToProps(contestId: string, onChange: () => void): () => void {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(`v2-props:${contestId}`);

  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_prop_questions", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_prop_answers", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_contests", filter: `id=eq.${contestId}` }, onChange);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "v2_contest_participants", filter: `contest_id=eq.${contestId}` }, onChange);
  channel.subscribe();

  return () => { void supabase.removeChannel(channel); };
}
