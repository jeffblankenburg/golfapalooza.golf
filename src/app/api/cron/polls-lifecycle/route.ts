import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAudienceUserIds } from "@/lib/audience";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * @swagger
 * /api/cron/polls-lifecycle:
 *   get:
 *     summary: Promote scheduled→active and active→closed polls
 *     tags: [Cron, Polls]
 *     description: |
 *       Bearer-authed. Runs every minute. Activates scheduled polls whose
 *       starts_at has passed (one at a time, since the partial unique index
 *       enforces a single active poll); closes active polls whose ends_at
 *       has passed. Sends launch notifications when send_notification_on_launch
 *       is true.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // Close any active polls whose end time has passed.
  const { data: toClose } = await adminClient
    .from("polls")
    .select("id")
    .eq("status", "active")
    .lte("ends_at", now);

  let closed = 0;
  if (toClose && toClose.length > 0) {
    const { error } = await adminClient
      .from("polls")
      .update({ status: "closed" })
      .in(
        "id",
        toClose.map((p) => p.id)
      );
    if (!error) closed = toClose.length;
  }

  // Activate scheduled polls whose start time has passed. Only one can be
  // active at a time (DB-enforced); pick the earliest-scheduled candidate.
  const { data: activeRow } = await adminClient
    .from("polls")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  let activated = 0;
  let notified = 0;

  if (!activeRow) {
    const { data: candidates } = await adminClient
      .from("polls")
      .select(
        "id, title, description, audience_type, audience_user_ids, trip_id, send_notification_on_launch"
      )
      .eq("status", "scheduled")
      .lte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(1);

    if (candidates && candidates.length > 0) {
      const poll = candidates[0];
      const { error } = await adminClient
        .from("polls")
        .update({ status: "active" })
        .eq("id", poll.id)
        .eq("status", "scheduled"); // optimistic concurrency guard

      if (!error) {
        activated = 1;
        if (poll.send_notification_on_launch) {
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
            notified = userIds.length;
          }
        }
      }
    }
  }

  return NextResponse.json({ closed, activated, notified });
}
