import type { RealtimeChannel } from "@supabase/supabase-js";
import { v2RealtimeClient } from "@/lib/v2/supabase-browser";

/**
 * Live subscription for a 3s-and-Ds activity. Fires `onChange` on any event log
 * change (a tap or an undo), game swap, or contest config change, so the scorer
 * console and the big board both refresh. Pairs with a slow poll on the board so
 * it never goes stale if a realtime event drops.
 */
export function subscribeToThrees(contestId: string, onChange: () => void): () => void {
  let channel: RealtimeChannel | null = null;
  let client: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
  let cancelled = false;

  (async () => {
    client = await v2RealtimeClient();
    if (cancelled) return;
    channel = client
      .channel(`v2-threes:${contestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "v2_3s_events", filter: `contest_id=eq.${contestId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "v2_matchups", filter: `contest_id=eq.${contestId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "v2_contests", filter: `id=eq.${contestId}` }, onChange)
      .subscribe();
  })();

  return () => {
    cancelled = true;
    if (client && channel) void client.removeChannel(channel);
  };
}
