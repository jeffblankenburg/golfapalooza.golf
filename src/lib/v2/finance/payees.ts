import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who collects a given obligation (finance epic #235). NULL stored = "use the
 * default": an event's payee falls back to its creator; a contest's falls back to
 * its event's treasurer, then its own creator. Resolve here, never inline, so the
 * rule stays in one place.
 */

export function resolveEventPayeeId(ev: { treasurer_user_id?: string | null; created_by?: string | null }): string | null {
  return ev.treasurer_user_id ?? ev.created_by ?? null;
}

export function resolveContestPayeeId(
  c: { collected_by?: string | null; created_by?: string | null },
  eventTreasurerId: string | null,
): string | null {
  return c.collected_by ?? eventTreasurerId ?? c.created_by ?? null;
}

/** Venmo handle per payee id — null when they haven't set one (can't be paid). */
export async function loadPayeeVenmo(admin: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids)].filter((x): x is string => !!x);
  if (uniq.length === 0) return new Map();
  const { data } = await admin.from("v2_profiles").select("id, venmo_username").in("id", uniq);
  return new Map((data || []).map((p) => [p.id as string, (p.venmo_username as string | null) || null]));
}
