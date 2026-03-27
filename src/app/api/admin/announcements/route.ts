import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

/**
 * @swagger
 * /api/admin/announcements:
 *   get:
 *     summary: Get announcement history (sent + scheduled)
 *     tags: [Admin, Notifications]
 *     responses:
 *       200:
 *         description: List of sent and scheduled announcements
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();

    // 1. Get scheduled announcements (pending + sent)
    const { data: scheduled } = await adminClient
      .from("scheduled_announcements")
      .select("id, title, body, audience_type, scheduled_for, status, sent_at, created_at")
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(50);

    // 2. Get sent announcement history from notifications table (deduped)
    const { data: raw } = await adminClient
      .from("notifications")
      .select("title, body, created_at")
      .eq("type", "announcement")
      .order("created_at", { ascending: false })
      .limit(500);

    // Group notification rows into distinct announcements
    const grouped = new Map<string, { title: string; body: string | null; sent_at: string; recipient_count: number }>();
    for (const row of raw || []) {
      const key = `${row.title}||${row.body}||${row.created_at}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.recipient_count++;
      } else {
        grouped.set(key, {
          title: row.title,
          body: row.body,
          sent_at: row.created_at,
          recipient_count: 1,
        });
      }
    }

    const sent = Array.from(grouped.values()).slice(0, 50);

    return NextResponse.json({
      scheduled: (scheduled || []).filter((s) => s.status === "pending"),
      sent,
    });
  } catch (error) {
    console.error("Get announcements error:", error);
    return NextResponse.json({ error: "Failed to load announcements" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/announcements:
 *   post:
 *     summary: Schedule a future announcement
 *     tags: [Admin, Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               audience_type:
 *                 type: string
 *                 enum: [everyone, event, custom]
 *               audience_user_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               trip_id:
 *                 type: string
 *               scheduled_for:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Announcement scheduled
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, body, audience_type, audience_user_ids, trip_id, scheduled_for } =
      await request.json();

    if (!title || !audience_type || !scheduled_for) {
      return NextResponse.json(
        { error: "title, audience_type, and scheduled_for are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("scheduled_announcements")
      .insert({
        title,
        body: body || null,
        audience_type,
        audience_user_ids: audience_type === "custom" ? audience_user_ids : null,
        trip_id: audience_type === "event" ? trip_id : null,
        scheduled_for,
        created_by: admin.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ announcement: data });
  } catch (error) {
    console.error("Schedule announcement error:", error);
    return NextResponse.json({ error: "Failed to schedule announcement" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/announcements:
 *   delete:
 *     summary: Cancel a pending scheduled announcement
 *     tags: [Admin, Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Announcement cancelled
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("scheduled_announcements")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel announcement error:", error);
    return NextResponse.json({ error: "Failed to cancel announcement" }, { status: 500 });
  }
}
