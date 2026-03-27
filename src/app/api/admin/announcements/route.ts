import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBulkNotifications,
  sendAnnouncement,
} from "@/lib/notifications/service";

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

    // Get all announcements from the scheduled_announcements table
    const { data: announcements } = await adminClient
      .from("scheduled_announcements")
      .select("id, title, body, audience_type, audience_user_ids, scheduled_for, status, sent_at, created_at")
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(50);

    // Collect all custom user IDs to resolve display names
    const allCustomIds = new Set<string>();
    for (const a of announcements || []) {
      if (a.audience_type === "custom" && Array.isArray(a.audience_user_ids)) {
        for (const id of a.audience_user_ids) allCustomIds.add(id as string);
      }
    }

    // Resolve user display names
    let userMap = new Map<string, string>();
    if (allCustomIds.size > 0) {
      const { data: users } = await adminClient
        .from("users")
        .select("id, display_name")
        .in("id", Array.from(allCustomIds));
      if (users) {
        userMap = new Map(users.map((u) => [u.id, u.display_name]));
      }
    }

    // Get recipient counts from notifications table for sent announcements
    const sentAnnouncementIds = (announcements || [])
      .filter((a) => a.status === "sent")
      .map((a) => a.id);

    const countMap = new Map<string, number>();

    if (sentAnnouncementIds.length > 0) {
      const { data: notifRaw } = await adminClient
        .from("notifications")
        .select("data")
        .eq("type", "announcement")
        .order("created_at", { ascending: false })
        .limit(500);

      for (const row of notifRaw || []) {
        const annId = (row.data as Record<string, unknown>)?.announcement_id as string | undefined;
        if (annId) {
          countMap.set(annId, (countMap.get(annId) || 0) + 1);
        }
      }
    }

    const scheduled = (announcements || [])
      .filter((a) => a.status === "pending")
      .map((a) => ({
        ...a,
        audience_names: a.audience_type === "custom" && Array.isArray(a.audience_user_ids)
          ? (a.audience_user_ids as string[]).map((id) => userMap.get(id) || "Unknown")
          : undefined,
      }));

    const sent = (announcements || [])
      .filter((a) => a.status === "sent")
      .map((a) => {
        return {
          ...a,
          recipient_count: countMap.get(a.id) || 0,
          audience_names: a.audience_type === "custom" && Array.isArray(a.audience_user_ids)
            ? (a.audience_user_ids as string[]).map((id) => userMap.get(id) || "Unknown")
            : undefined,
        };
      });

    return NextResponse.json({ scheduled, sent });
  } catch (error) {
    console.error("Get announcements error:", error);
    return NextResponse.json({ error: "Failed to load announcements" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/announcements:
 *   post:
 *     summary: Create an announcement (send now or schedule)
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
 *               send_now:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Announcement created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, body, audience_type, audience_user_ids, trip_id, scheduled_for, send_now } =
      await request.json();

    if (!title || !audience_type) {
      return NextResponse.json(
        { error: "title and audience_type are required" },
        { status: 400 }
      );
    }

    if (!send_now && !scheduled_for) {
      return NextResponse.json(
        { error: "scheduled_for is required when not sending now" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // Record in scheduled_announcements
    const { data, error } = await adminClient
      .from("scheduled_announcements")
      .insert({
        title,
        body: body || null,
        audience_type,
        audience_user_ids: audience_type === "custom" ? audience_user_ids : null,
        trip_id: audience_type === "event" ? trip_id : null,
        scheduled_for: send_now ? now : scheduled_for,
        status: send_now ? "sent" : "pending",
        sent_at: send_now ? now : null,
        created_by: admin.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If send_now, actually deliver the notifications
    if (send_now) {
      const notifPayload = {
        type: "announcement",
        title,
        body: body || undefined,
        data: { announcement_id: data.id },
      };

      if (audience_type === "everyone") {
        await sendAnnouncement({ title, body: body || undefined, data: { announcement_id: data.id } });
      } else {
        let userIds: string[] = [];

        if (audience_type === "event" && trip_id) {
          const { data: participants } = await adminClient
            .from("event_participants")
            .select("user_id")
            .eq("trip_id", trip_id);
          userIds = (participants || []).map((p) => p.user_id);
        } else if (audience_type === "custom") {
          userIds = audience_user_ids || [];
        }

        if (userIds.length > 0) {
          await sendBulkNotifications(userIds, notifPayload);
        }
      }
    }

    return NextResponse.json({ announcement: data });
  } catch (error) {
    console.error("Create announcement error:", error);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
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
      .in("status", ["pending", "sent"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also remove associated notifications from users' notification lists
    await adminClient
      .from("notifications")
      .delete()
      .eq("data->>announcement_id", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel announcement error:", error);
    return NextResponse.json({ error: "Failed to cancel announcement" }, { status: 500 });
  }
}
