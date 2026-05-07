import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/attendance/grid:
 *   get:
 *     summary: Full attendance matrix — every Loozer × every trip
 *     description: Each (user, trip) pair is "attended" iff `event_participants.on_roster=true` for that pair. Historical workbook rows were unified into the same table by migration 00133, so this is now the single source.
 *     tags: [Admin]
 *     responses:
 *       200: { description: trips + loozers + roster rows }
 *       401: { description: Unauthorized }
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_accolades");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const [{ data: trips }, { data: loozers }, { data: roster }] = await Promise.all([
    adminClient
      .from("trip_settings")
      .select("id, trip_name, trip_year, status")
      .order("trip_year", { ascending: true }),
    // Show every Loozer, including financial-only — historical attendance
    // doesn't care whether someone uses the app. Only bots are excluded.
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("is_system", false)
      .order("display_name"),
    adminClient
      .from("event_participants")
      .select("user_id, trip_id")
      .eq("on_roster", true),
  ]);

  return NextResponse.json({
    trips: trips || [],
    loozers: loozers || [],
    roster: roster || [],
  });
}
