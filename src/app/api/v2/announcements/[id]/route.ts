import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { deliverAnnouncement, type AnnouncementAudience } from "@/lib/v2/announcements";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * @swagger
 * /api/v2/announcements/{id}:
 *   put:
 *     tags: [Announcements]
 *     summary: Edit a pending announcement, or send it now (action=send)
 *   delete:
 *     tags: [Announcements]
 *     summary: Cancel/delete an announcement (also removes delivered notifications)
 * Every operation requires send_announcements (or org owner/admin) on the org.
 */

async function guard(
  request: Request,
  id: string,
): Promise<
  | { admin: SupabaseClient; userId: string; row: AnnRow }
  | { error: string; status: 401 | 403 | 404 }
> {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 };
  const admin = v2AdminClient();
  const { data: row } = await admin
    .from("v2_announcements")
    .select("id, org_id, title, body, audience_type, audience_user_ids, event_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Not found", status: 404 };
  if (!(await hasPermission(admin, userId, row.org_id, "send_announcements"))) {
    return { error: "Not allowed", status: 403 };
  }
  return { admin, userId, row: row as AnnRow };
}

interface AnnRow {
  id: string;
  org_id: string;
  title: string;
  body: string | null;
  audience_type: AnnouncementAudience;
  audience_user_ids: string[] | null;
  event_id: string | null;
  status: "pending" | "sent" | "cancelled";
}

async function slugForOrg(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin.from("v2_organizations").select("slug").eq("id", orgId).maybeSingle();
  return data?.slug ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    action?: "send";
    title?: string;
    body?: string;
    audience_type?: AnnouncementAudience;
    audience_user_ids?: string[];
    event_id?: string | null;
    scheduled_for?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Send a pending announcement immediately.
  if (body.action === "send") {
    if (g.row.status !== "pending") {
      return NextResponse.json({ error: "Only a pending announcement can be sent" }, { status: 400 });
    }
    const slug = await slugForOrg(g.admin, g.row.org_id);
    const count = await deliverAnnouncement(g.admin, g.row, slug);
    await g.admin
      .from("v2_announcements")
      .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: count, scheduled_for: null })
      .eq("id", id);
    return NextResponse.json({ status: "sent", recipient_count: count });
  }

  // Otherwise edit — only while still pending.
  if (g.row.status !== "pending") {
    return NextResponse.json({ error: "Only a pending announcement can be edited" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = (body.title || "").trim();
    if (!t) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    patch.title = t;
  }
  if (body.body !== undefined) patch.body = (body.body || "").trim() || null;
  if (body.audience_type !== undefined) {
    if (!["everyone", "event", "custom"].includes(body.audience_type)) {
      return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
    }
    patch.audience_type = body.audience_type;
    patch.audience_user_ids =
      body.audience_type === "custom" ? [...new Set((body.audience_user_ids || []).filter(Boolean))] : null;
    patch.event_id = body.audience_type === "event" ? body.event_id ?? null : null;
  }
  if (body.scheduled_for !== undefined) {
    if (body.scheduled_for && new Date(body.scheduled_for).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
    }
    patch.scheduled_for = body.scheduled_for;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await g.admin.from("v2_announcements").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // Remove any delivered notifications for this announcement, then the record.
  await g.admin.from("v2_notifications").delete().eq("type", "announcement").contains("data", { announcementId: id });
  const { error } = await g.admin.from("v2_announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
