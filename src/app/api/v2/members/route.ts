import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * GET /api/v2/members?orgId= — the full member directory (grid / tree / map):
 * every active member with names, avatar, sponsor link, founder flag, location,
 * and events-attended count. Org-gated.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const [{ data: rows }, mode, { data: events }] = await Promise.all([
    admin
      .from("v2_memberships")
      .select(
        "user_id, member:v2_profiles(id, display_name, first_name, last_name, avatar_url, sponsor_id, is_founder, latitude, longitude, city, state)",
      )
      .eq("org_id", orgId)
      .eq("status", "active"),
    orgNameMode(admin, orgId),
    admin.from("v2_events").select("id").eq("org_id", orgId),
  ]);

  // events-attended per member (distinct events with a non-declined RSVP).
  const eventIds = (events || []).map((e) => e.id);
  const attended = new Map<string, Set<string>>();
  if (eventIds.length) {
    const { data: parts } = await admin
      .from("v2_event_participants")
      .select("user_id, event_id, status")
      .in("event_id", eventIds)
      .neq("status", "not_going");
    for (const p of parts || []) {
      if (!attended.has(p.user_id)) attended.set(p.user_id, new Set());
      attended.get(p.user_id)!.add(p.event_id);
    }
  }

  const members = (rows || [])
    .map((r) => {
      const p = Array.isArray(r.member) ? r.member[0] : r.member;
      if (!p) return null;
      const full = `${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim();
      return {
        id: p.id as string,
        displayName: pickName(p, mode),
        fullName: full || null,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        sponsorId: (p.sponsor_id as string | null) ?? null,
        isFounder: p.is_founder === true,
        latitude: (p.latitude as number | null) ?? null,
        longitude: (p.longitude as number | null) ?? null,
        city: (p.city as string | null) ?? null,
        state: (p.state as string | null) ?? null,
        eventsAttended: attended.get(p.id as string)?.size ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.displayName.localeCompare(b!.displayName));

  return NextResponse.json({ members });
}
