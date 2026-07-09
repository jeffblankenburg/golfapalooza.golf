import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { syncAttendanceEnrollment } from "@/lib/attendance-contest-sync";

/**
 * @swagger
 * /api/admin/attendance/cell:
 *   put:
 *     summary: Toggle one (Loozer × trip) attendance cell
 *     description: Body — `{userId, tripId, attended}`. Writes to `event_participants` (single source for both modern and historical events after migration 00133). Checking sets `on_roster=true` and `likelihood=99`; un-checking sets `on_roster=false` and preserves the user's `likelihood` so we don't override their RSVP choice.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 */
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_accolades");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    userId?: string;
    tripId?: string;
    attended?: boolean;
  };
  if (!body.userId || !body.tripId || typeof body.attended !== "boolean") {
    return NextResponse.json(
      { error: "userId, tripId, and attended are required" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  if (body.attended) {
    const { data: existing } = await adminClient
      .from("event_participants")
      .select("id")
      .eq("trip_id", body.tripId)
      .eq("user_id", body.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await adminClient
        .from("event_participants")
        .update({ on_roster: true, likelihood: 99, likelihood_set_at: new Date().toISOString() })
        .eq("trip_id", body.tripId)
        .eq("user_id", body.userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await adminClient.from("event_participants").insert({
        trip_id: body.tripId,
        user_id: body.userId,
        on_roster: true,
        likelihood: 99,
        likelihood_set_at: new Date().toISOString(),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Attendance -> blanket-contest enrollment (issue #137).
    const sync = await syncAttendanceEnrollment(adminClient, body.tripId, body.userId, true);
    return NextResponse.json({ success: true, enrollment: sync });
  } else {
    const { error } = await adminClient
      .from("event_participants")
      .update({ on_roster: false })
      .eq("trip_id", body.tripId)
      .eq("user_id", body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Guarded un-enroll: remove from auto-enroll contests, but refuse (and
    // warn) where a Calcutta bid / scramble seat / KGB pairing would be
    // orphaned. Admin sees the warnings and unwinds those by hand.
    const sync = await syncAttendanceEnrollment(adminClient, body.tripId, body.userId, false);
    return NextResponse.json({ success: true, enrollment: sync });
  }
}
