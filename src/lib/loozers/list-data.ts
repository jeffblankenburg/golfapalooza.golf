// Shared loader for the /loozers list. Used by:
//   - /api/loozers (client-callers)
//   - /loozers server page (SSR; eliminates a double-fetch)

import type { SupabaseClient } from "@supabase/supabase-js";

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
  const { data: activeTrip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  const [
    { data: users },
    { data: bios },
    { data: roster },
    { data: rosterAll },
    { data: attendance },
  ] = await Promise.all([
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
    // Lifetime roster signal across every trip — feeds the events_attended
    // count alongside the historical workbook table.
    adminClient
      .from("event_participants")
      .select("user_id, trip_id")
      .eq("on_roster", true),
    adminClient.from("event_attendance").select("user_id, trip_id"),
  ]);

  const bioUserIds = new Set(
    (bios || [])
      .filter((b) => b.content && b.content.trim().length > 0)
      .map((b) => b.user_id),
  );
  const attendingUserIds = new Set((roster || []).map((r) => r.user_id));
  // Union (user, trip) pairs from both sources, then count distinct trips per user.
  const attendedTripsByUser = new Map<string, Set<string>>();
  for (const r of rosterAll || []) {
    if (!attendedTripsByUser.has(r.user_id)) attendedTripsByUser.set(r.user_id, new Set());
    attendedTripsByUser.get(r.user_id)!.add(r.trip_id);
  }
  for (const r of attendance || []) {
    if (!attendedTripsByUser.has(r.user_id)) attendedTripsByUser.set(r.user_id, new Set());
    attendedTripsByUser.get(r.user_id)!.add(r.trip_id);
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
    events_attended: attendedTripsByUser.get(u.id)?.size ?? 0,
  }));
}
