import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

const PROFILE = "id, display_name, first_name, last_name, nickname, avatar_url, city, state, is_founder, sponsor_id, birthdate, playing_since, occupation, swings, typical_shot, shirt_size, fun_fact, best_shot";
const REF = "id, display_name, first_name, last_name, nickname, avatar_url";

/**
 * GET /api/v2/members/[id]?orgId= — one member's public detail for the directory:
 * profile + sponsor + who they sponsor + accolades + handicap + events-attended,
 * plus the viewer's follow state (and per-follow toggles).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const orgId = new URL(request.url).searchParams.get("orgId");

  const admin = v2AdminClient();
  const { data: member } = await admin.from("v2_profiles").select(PROFILE).eq("id", id).maybeSingle();
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const [{ data: sponsorRow }, { data: descendants }, { data: accolades }, { data: hcap }, follow] = await Promise.all([
    member.sponsor_id
      ? admin.from("v2_profiles").select(REF).eq("id", member.sponsor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("v2_profiles").select(REF).eq("sponsor_id", id).order("display_name"),
    admin.from("v2_accolades").select("title, year").eq("user_id", id).order("year", { ascending: false }),
    admin.from("v2_player_handicaps").select("handicap_index").eq("user_id", id).maybeSingle(),
    admin
      .from("v2_user_favorites")
      .select("notify_round_started, notify_hole_completed, notify_round_completed")
      .eq("follower_id", userId)
      .eq("favorite_user_id", id)
      .maybeSingle(),
  ]);

  // archived (inactive) state is per-org, on the membership — orthogonal to status.
  let archived = false;
  if (orgId) {
    const { data: mem } = await admin
      .from("v2_memberships")
      .select("archived_at")
      .eq("org_id", orgId)
      .eq("user_id", id)
      .maybeSingle();
    archived = !!(mem?.archived_at as string | null);
  }

  // events-attended within the org (non-declined RSVPs).
  let eventsAttended = 0;
  if (orgId) {
    const { data: evs } = await admin.from("v2_events").select("id").eq("org_id", orgId);
    const ids = (evs || []).map((e) => e.id);
    if (ids.length) {
      const { count } = await admin
        .from("v2_event_participants")
        .select("event_id", { count: "exact", head: true })
        .eq("user_id", id)
        .neq("status", "not_going")
        .in("event_id", ids);
      eventsAttended = count ?? 0;
    }
  }

  return NextResponse.json({
    member,
    sponsor: sponsorRow ?? null,
    descendants: descendants || [],
    accolades: accolades || [],
    handicap: (hcap?.handicap_index as number | null) ?? null,
    eventsAttended,
    archived,
    isFollowing: !!follow.data,
    followToggles: follow.data ?? null,
  });
}
