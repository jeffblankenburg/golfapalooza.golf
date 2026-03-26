import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendNotification,
  sendBulkNotifications,
  sendAnnouncement,
} from "@/lib/notifications/service";

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     summary: Send notification(s) (admin only)
 *     tags: [Notifications, Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               announcement:
 *                 type: boolean
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Notification(s) sent
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { userIds, announcement, type, title, data } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (announcement) {
    await sendAnnouncement({ title, body: body.body, data });
  } else if (userIds?.length) {
    if (userIds.length === 1) {
      await sendNotification(userIds[0], {
        type: type || "admin",
        title,
        body: body.body,
        data,
      });
    } else {
      await sendBulkNotifications(userIds, {
        type: type || "admin",
        title,
        body: body.body,
        data,
      });
    }
  } else {
    return NextResponse.json(
      { error: "Provide userIds or set announcement: true" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
