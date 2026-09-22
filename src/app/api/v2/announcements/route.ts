import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { deliverAnnouncement, type AnnouncementAudience } from "@/lib/v2/announcements";
import { getOrgSystemIdentity } from "@/lib/v2/system-user";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * @swagger
 * /api/v2/announcements:
 *   get:
 *     tags: [Announcements]
 *     summary: List an org's announcements + the roster/events needed to compose one
 *     description: Requires the send_announcements permission (or org owner/admin).
 *   post:
 *     tags: [Announcements]
 *     summary: Create an announcement (send now or schedule for later)
 */

async function guard(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "send_announcements"))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

async function slugForOrg(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin.from("v2_organizations").select("slug").eq("id", orgId).maybeSingle();
  return data?.slug ?? null;
}

export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const g = await guard(request, orgId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // One round-trip each: announcement history, the roster (custom audience), the
  // event list (event audience). Parallelized.
  const [annRes, memRes, evtRes, systemIdentity] = await Promise.all([
    g.admin
      .from("v2_announcements")
      .select(
        "id, title, body, audience_type, audience_user_ids, event_id, scheduled_for, status, recipient_count, created_at, sent_at, created_by, send_as_system, sender:v2_profiles!v2_announcements_created_by_fkey(display_name, first_name, last_name, nickname)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    g.admin
      .from("v2_memberships")
      .select("user_id, profile:v2_profiles(display_name, first_name, last_name, nickname, is_system)")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("archived_at", null),
    g.admin
      .from("v2_events")
      .select("id, name, year, status")
      .eq("org_id", orgId)
      .order("year", { ascending: false }),
    getOrgSystemIdentity(g.admin, orgId),
  ]);

  const members = (memRes.data || [])
    .map((m) => {
      const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as
        | { display_name?: string; first_name?: string | null; last_name?: string | null; nickname?: string | null; is_system?: boolean }
        | null;
      return {
        user_id: m.user_id,
        display_name: p?.display_name || "Member",
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        nickname: p?.nickname ?? null,
        is_system: !!p?.is_system,
      };
    })
    // The system entity is never a selectable audience member.
    .filter((m) => !m.is_system);

  // Normalize the embedded sender (created_by) to a single object so the client
  // can show who actually sent it — even when it was authored as the system.
  const announcements = (annRes.data || []).map((a) => {
    const { sender, ...rest } = a as typeof a & { sender: unknown };
    return { ...rest, sender: Array.isArray(sender) ? sender[0] ?? null : sender ?? null };
  });

  return NextResponse.json({
    announcements,
    members,
    events: evtRes.data || [],
    systemSender: { name: systemIdentity.name, avatar: systemIdentity.avatar_url },
  });
}

export async function POST(request: Request) {
  let body: {
    orgId?: string;
    title?: string;
    body?: string;
    audience_type?: AnnouncementAudience;
    audience_user_ids?: string[];
    event_id?: string | null;
    scheduled_for?: string | null;
    send_now?: boolean;
    send_as_system?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const g = await guard(request, orgId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const audience: AnnouncementAudience = body.audience_type || "everyone";
  if (!["everyone", "event", "custom"].includes(audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }
  if (audience === "event" && !body.event_id) {
    return NextResponse.json({ error: "Pick an event for an event audience" }, { status: 400 });
  }
  const customIds = audience === "custom" ? [...new Set((body.audience_user_ids || []).filter(Boolean))] : null;
  if (audience === "custom" && (!customIds || customIds.length === 0)) {
    return NextResponse.json({ error: "Pick at least one member" }, { status: 400 });
  }

  const sendNow = body.send_now !== false && !body.scheduled_for;
  if (!sendNow && body.scheduled_for && new Date(body.scheduled_for).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
  }

  const insertRow = {
    org_id: orgId,
    title,
    body: (body.body || "").trim() || null,
    audience_type: audience,
    audience_user_ids: customIds,
    event_id: audience === "event" ? body.event_id ?? null : null,
    scheduled_for: sendNow ? null : body.scheduled_for ?? null,
    status: "pending" as const,
    created_by: g.userId,
    send_as_system: body.send_as_system === true,
  };

  const { data: created, error } = await g.admin
    .from("v2_announcements")
    .insert(insertRow)
    .select("id, org_id, title, body, audience_type, audience_user_ids, event_id, created_by, send_as_system")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sendNow) {
    const slug = await slugForOrg(g.admin, orgId);
    const count = await deliverAnnouncement(g.admin, created, slug);
    await g.admin
      .from("v2_announcements")
      .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: count })
      .eq("id", created.id);
    return NextResponse.json({ id: created.id, status: "sent", recipient_count: count });
  }

  return NextResponse.json({ id: created.id, status: "pending" });
}
