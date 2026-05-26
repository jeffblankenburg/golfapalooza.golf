import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * Issue #131. Pings every freshly-added player on a round with a deep link
 * into the live scorer. Skips the actor (the user who took the action) since
 * they already know — they're the one who just added the players. Failures
 * are swallowed: notification problems must never block round creation.
 *
 * Used from:
 *  - POST /api/rounds           — initial roster
 *  - POST /api/rounds/{id}/players — mid-round add
 *
 * Simulator suppression is handled inside sendBulkNotifications via
 * isSimulatingTrip() so no extra guard needed here.
 */
export async function notifyPlayersAddedToRound({
  roundId,
  playerUserIds,
  actorUserId,
}: {
  roundId: string;
  playerUserIds: string[];
  actorUserId: string;
}): Promise<void> {
  try {
    const recipients = playerUserIds.filter((id) => id && id !== actorUserId);
    if (recipients.length === 0) return;

    const admin = createAdminClient();

    const [{ data: round }, { data: actor }] = await Promise.all([
      admin
        .from("rounds")
        .select("id, course:courses(name), tee:course_tees(tee_color)")
        .eq("id", roundId)
        .single(),
      admin
        .from("users")
        .select("display_name")
        .eq("id", actorUserId)
        .maybeSingle(),
    ]);

    if (!round) return;

    const course = Array.isArray(round.course) ? round.course[0] : round.course;
    const tee = Array.isArray(round.tee) ? round.tee[0] : round.tee;
    const courseName = course?.name || "a round";
    const teeColor = tee?.tee_color || null;
    const actorName = actor?.display_name || "A Loozer";

    const body = teeColor ? `${courseName} — ${teeColor} tees` : courseName;

    await sendBulkNotifications(recipients, {
      type: "round_invite",
      title: `${actorName} added you to a round`,
      body,
      data: {
        round_id: roundId,
        actor_user_id: actorUserId,
        // The service worker (public/sw.js) reads `data.url` to route the
        // notification click. Keep this key in sync with that handler.
        url: `/my-rounds/rounds/${roundId}/live`,
      },
    });
  } catch (err) {
    // Notifications are best-effort; never throw from this path.
    console.error("[notifyPlayersAddedToRound] failed", err);
  }
}
