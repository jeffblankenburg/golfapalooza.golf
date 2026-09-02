import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId, getEffectiveUserId } from "@/lib/simulator";
import { canManageBolandPayouts } from "@/lib/boland-bet/compute";

/**
 * @swagger
 * /api/boland-bet/paid:
 *   post:
 *     tags: [Rounds]
 *     summary: Mark a Boland Bet winner paid / unpaid
 *     description: >
 *       Toggles whether Pat Boland has paid a winning player. Presence of a
 *       `boland_bet_payments` row = paid; setting `paid:false` deletes it. Only
 *       Boland or an app admin may call this (simulator-aware).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, paid]
 *             properties:
 *               userId: { type: string, description: The winner being paid }
 *               paid: { type: boolean }
 *     responses:
 *       200: { description: Updated. }
 *       400: { description: Missing/invalid body. }
 *       401: { description: Not authenticated. }
 *       403: { description: Caller is not Boland. }
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const paid = body?.paid;
  if (typeof userId !== "string" || typeof paid !== "boolean") {
    return NextResponse.json({ error: "userId and paid are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const tripId = await getEffectiveTripId();
  if (!tripId) {
    return NextResponse.json({ error: "No active trip" }, { status: 400 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  if (!(await canManageBolandPayouts(admin, effectiveUserId))) {
    return NextResponse.json({ error: "Only Boland or an admin can mark payouts" }, { status: 403 });
  }

  if (paid) {
    const { error } = await admin
      .from("boland_bet_payments")
      .upsert(
        { trip_id: tripId, user_id: userId, paid_by: effectiveUserId, paid_at: new Date().toISOString() },
        { onConflict: "trip_id,user_id" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("boland_bet_payments")
      .delete()
      .eq("trip_id", tripId)
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, userId, paid });
}
