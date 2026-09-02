import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId, getEffectiveUserId } from "@/lib/simulator";
import { getBolandBet, canManageBolandPayouts } from "@/lib/boland-bet/compute";

/**
 * @swagger
 * /api/boland-bet:
 *   get:
 *     tags: [Rounds]
 *     summary: Boland Bet standings for the active trip
 *     description: >
 *       Returns the Hole #1 KGB Cup side-bet standings (opted-in players, their
 *       Hole #1 gross score, per-line balance, and net total), or null when the
 *       bet doesn't exist / nobody has opted in. Used by the Boland Bet page to
 *       refresh live when scores change.
 *     responses:
 *       200:
 *         description: The current standings (or `{ bet: null }`).
 *       401:
 *         description: Not authenticated.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const tripId = await getEffectiveTripId();
  if (!tripId) return NextResponse.json({ bet: null, canManage: false });

  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, course_id")
    .eq("id", tripId)
    .single();

  const [bet, canManage] = await Promise.all([
    trip ? getBolandBet(admin, trip) : Promise.resolve(null),
    canManageBolandPayouts(admin, await getEffectiveUserId(user.id)),
  ]);
  return NextResponse.json({ bet, canManage });
}
