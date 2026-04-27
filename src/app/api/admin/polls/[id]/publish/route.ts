import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadPollWithQuestions, findOverlappingPolls } from "@/lib/polls";
import { resolveAudienceUserIds } from "@/lib/audience";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * @swagger
 * /api/admin/polls/{id}/publish:
 *   post:
 *     summary: Publish a draft poll (immediate or scheduled)
 *     tags: [Admin, Polls]
 *     description: |
 *       Body: { starts_at: ISO, ends_at: ISO }
 *       If starts_at <= now, the poll becomes active immediately and a launch
 *       notification is sent (when send_notification_on_launch is true).
 *       Otherwise the poll is scheduled and the cron will activate it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { starts_at, ends_at } = await request.json();

  if (!starts_at || !ends_at) {
    return NextResponse.json(
      { error: "starts_at and ends_at are required" },
      { status: 400 }
    );
  }

  const startDate = new Date(starts_at);
  const endDate = new Date(ends_at);
  if (endDate <= startDate) {
    return NextResponse.json(
      { error: "ends_at must be after starts_at" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const poll = await loadPollWithQuestions(adminClient, id);
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (poll.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot publish poll with status '${poll.status}'` },
      { status: 400 }
    );
  }

  if (poll.questions.length === 0) {
    return NextResponse.json(
      { error: "Poll must have at least one question before publishing" },
      { status: 400 }
    );
  }

  const conflicts = await findOverlappingPolls(adminClient, starts_at, ends_at, id);
  if (conflicts.length > 0) {
    return NextResponse.json(
      { error: "Window overlaps another poll", conflicts },
      { status: 409 }
    );
  }

  const now = Date.now();
  const goLive = startDate.getTime() <= now;
  const newStatus = goLive ? "active" : "scheduled";

  const { error: updErr } = await adminClient
    .from("polls")
    .update({ status: newStatus, starts_at, ends_at })
    .eq("id", id);

  if (updErr) {
    // Most likely cause: the partial unique index for one-active-poll fired.
    return NextResponse.json({ error: updErr.message }, { status: 409 });
  }

  // Launch notification fires only on immediate activation (cron handles
  // scheduled→active activations and their notifications).
  if (goLive && poll.send_notification_on_launch) {
    const userIds = await resolveAudienceUserIds(adminClient, {
      audience_type: poll.audience_type,
      audience_user_ids: poll.audience_user_ids,
      trip_id: poll.trip_id,
    });
    if (userIds.length > 0) {
      await sendBulkNotifications(userIds, {
        type: "poll",
        title: poll.title,
        body: poll.description || "A new poll is open — tap to vote.",
        data: { poll_id: poll.id },
      });
    }
  }

  return NextResponse.json({ status: newStatus, starts_at, ends_at });
}
