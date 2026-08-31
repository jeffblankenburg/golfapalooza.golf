// Shared loader for the /loozers list. Used by:
//   - /api/loozers (client-callers)
//   - /loozers server page (SSR; eliminates a double-fetch)

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveTripId } from "@/lib/simulator";

export interface LoozerListItem {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  has_bio: boolean;
  sponsor_id: string | null;
  is_founder: boolean;
  is_financial_only: boolean;
  is_attending: boolean;
  events_attended: number;
}

export async function loadLoozerList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, "public", any>,
): Promise<LoozerListItem[]> {
  const effectiveTripId = await getEffectiveTripId();
  const { data: activeTrip } = effectiveTripId
    ? await adminClient
        .from("trip_settings")
        .select("id")
        .eq("id", effectiveTripId)
        .maybeSingle()
    : { data: null };

  const [{ data: users }, { data: bios }, { data: roster }, { data: rosterAll }] =
    await Promise.all([
      adminClient
        .from("users")
        .select("id, display_name, full_name, avatar_url, sponsor_id, is_founder, is_financial_only")
        .eq("is_system", false)
        .order("display_name"),
      adminClient
        .from("loozer_bios")
        .select("user_id, content")
        .eq("is_visible", true),
      activeTrip
        ? adminClient
            .from("event_participants")
            .select("user_id")
            .eq("trip_id", activeTrip.id)
            .eq("on_roster", true)
        : Promise.resolve({ data: [] as { user_id: string }[] }),
      // Lifetime roster signal — single source for the events_attended
      // count (modern + historical both live here). Counts DISTINCT trip
      // YEARS, not raw rows: a year can carry >1 trip (e.g. 2026 has both
      // the live event and the '🧪 Test Event' sandbox), and that must
      // still be a single attended year. Only 'active'/'archived' trips
      // count — 'test'/'draft' sandboxes are excluded outright.
      adminClient
        .from("event_participants")
        .select("user_id, trip_settings!inner(trip_year, status)")
        .eq("on_roster", true)
        .in("trip_settings.status", ["active", "archived"]),
    ]);

  const bioUserIds = new Set(
    (bios || [])
      .filter((b) => b.content && b.content.trim().length > 0)
      .map((b) => b.user_id),
  );
  const attendingUserIds = new Set((roster || []).map((r) => r.user_id));
  // Count distinct (user, trip_year) pairs so a year with multiple trips
  // still counts once. The embedded trip_settings is a to-one relation.
  const attendanceCounts = new Map<string, number>();
  const seenUserYear = new Set<string>();
  for (const r of rosterAll || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trip: any = Array.isArray(r.trip_settings) ? r.trip_settings[0] : r.trip_settings;
    const year = trip?.trip_year;
    if (year == null) continue;
    const key = `${r.user_id}:${year}`;
    if (seenUserYear.has(key)) continue;
    seenUserYear.add(key);
    attendanceCounts.set(r.user_id, (attendanceCounts.get(r.user_id) || 0) + 1);
  }

  return (users || []).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    has_bio: bioUserIds.has(u.id),
    sponsor_id: u.sponsor_id,
    is_founder: u.is_founder,
    is_financial_only: u.is_financial_only,
    is_attending: attendingUserIds.has(u.id),
    events_attended: attendanceCounts.get(u.id) ?? 0,
  }));
}
