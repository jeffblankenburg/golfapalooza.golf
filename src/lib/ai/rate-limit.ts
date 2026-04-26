// Per-user daily rate limit, counted off the ai_generations audit log.
// Cache hits and rejected (low-confidence) AI calls don't count — only
// committed lookups do, so a user can spam manual fallbacks without
// exhausting their cap.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitState {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}

export async function checkAiRateLimit(
  admin: SupabaseClient,
  userId: string,
  task: string,
  perDayLimit = 5
): Promise<RateLimitState> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("task", task)
    .eq("committed", true)
    .gte("created_at", since);

  const used = count || 0;
  return {
    used,
    limit: perDayLimit,
    remaining: Math.max(0, perDayLimit - used),
    exceeded: used >= perDayLimit,
  };
}
