import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/attendance/grid:
 *   get:
 *     summary: Full attendance matrix — every Loozer × every trip
 *     description: Each (user, trip) pair is "attended" if either (a) the user is `on_roster=true` in `event_participants` for that trip — the live, modern source updated by RSVPs and the per-event Roster admin, OR (b) a row exists in `event_attendance` for that pair (historical workbook + admin-marked legacy events). Trips with any `event_participants` rows are flagged `has_roster: true` so the client knows where to dispatch toggles.
 *     tags: [Admin]
 *     responses:
 *       200: { description: trips + loozers + roster + attendance rows }
 *       401: { description: Unauthorized }
 */
export async function GET() {
  const admin = await checkPermissionAccess("manage_accolades");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const [
    { data: trips },
    { data: loozers },
    { data: roster },
    { data: rosterAny },
    { data: attendance },
  ] = await Promise.all([
    adminClient
      .from("trip_settings")
      .select("id, trip_name, trip_year, status")
      .order("trip_year", { ascending: true }),
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("is_system", false)
      .eq("is_financial_only", false)
      .order("display_name"),
    adminClient
      .from("event_participants")
      .select("user_id, trip_id")
      .eq("on_roster", true),
    // Any participant row at all (regardless of on_roster) — tells us the
    // trip "has a roster" so the client knows to write to event_participants.
    adminClient.from("event_participants").select("trip_id"),
    adminClient.from("event_attendance").select("user_id, trip_id"),
  ]);

  const tripsWithRoster = new Set((rosterAny || []).map((r) => r.trip_id));
  const tripsOut = (trips || []).map((t) => ({
    ...t,
    has_roster: tripsWithRoster.has(t.id),
  }));

  return NextResponse.json({
    trips: tripsOut,
    loozers: loozers || [],
    roster: roster || [],
    attendance: attendance || [],
  });
}
