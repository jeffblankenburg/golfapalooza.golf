import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/scramble-stats:
 *   get:
 *     summary: Get scramble stats (eight bag avg & avg scramble) for all users
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of user scramble stats
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_loozers");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("users")
    .select("id, display_name, eight_bag_average, avg_scramble_score")
    .eq("is_financial_only", false)
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = (data || []).map((u) => ({
    user_id: u.id,
    display_name: u.display_name,
    eight_bag_average: u.eight_bag_average,
    avg_scramble_score: u.avg_scramble_score,
  }));

  return NextResponse.json({ stats });
}

/**
 * @swagger
 * /api/admin/scramble-stats:
 *   put:
 *     summary: Update scramble stats for a user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
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
  const admin = await checkPermissionAccess("manage_loozers");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_id, eight_bag_average, avg_scramble_score } = await request.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("users")
    .update({
      eight_bag_average: eight_bag_average ?? null,
      avg_scramble_score: avg_scramble_score ?? null,
    })
    .eq("id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
