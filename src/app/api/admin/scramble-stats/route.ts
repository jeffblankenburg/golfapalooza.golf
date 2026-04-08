import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/admin/scramble-stats:
 *   get:
 *     summary: Get scramble stats for all users in a trip
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of scramble stats
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_scramble_stats")
    .select("id, user_id, eight_bag_average, avg_scramble_score")
    .eq("trip_id", tripId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stats: data || [] });
}

/**
 * @swagger
 * /api/admin/scramble-stats:
 *   put:
 *     summary: Upsert scramble stats for a user in a trip
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trip_id, user_id]
 *             properties:
 *               trip_id:
 *                 type: string
 *               user_id:
 *                 type: string
 *               eight_bag_average:
 *                 type: number
 *                 nullable: true
 *               avg_scramble_score:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Stats saved
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trip_id, user_id, eight_bag_average, avg_scramble_score } =
    await request.json();

  if (!trip_id || !user_id) {
    return NextResponse.json(
      { error: "trip_id and user_id are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("user_scramble_stats").upsert(
    {
      user_id,
      trip_id,
      eight_bag_average: eight_bag_average ?? null,
      avg_scramble_score: avg_scramble_score ?? null,
    },
    { onConflict: "user_id,trip_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
