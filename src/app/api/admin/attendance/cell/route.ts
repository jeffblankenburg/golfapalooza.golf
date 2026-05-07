import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/attendance/cell:
 *   put:
 *     summary: Toggle one (Loozer × trip) attendance cell
 *     description: Body — `{userId, tripId, attended, target: "roster" | "historical"}`. `target=roster` writes to `event_participants` (used for any trip that has a live roster, including the active event); `target=historical` writes to `event_attendance` (legacy/workbook-imported events with no roster). Idempotent.
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
    target?: "roster" | "historical";
  };
  if (
    !body.userId ||
    !body.tripId ||
    typeof body.attended !== "boolean" ||
    (body.target !== "roster" && body.target !== "historical")
  ) {
    return NextResponse.json(
      { error: "userId, tripId, attended, and target='roster'|'historical' are required" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  if (body.target === "roster") {
    // Modern trip: toggle event_participants.on_roster. When checking, also
    // bump likelihood to 99 so the home-page participants pill reflects it.
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
    } else {
      // Un-check: drop them off the roster but keep their RSVP `likelihood`
      // so we don't override what the user themselves chose.
      const { error } = await adminClient
        .from("event_participants")
        .update({ on_roster: false })
        .eq("trip_id", body.tripId)
        .eq("user_id", body.userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Historical trip: toggle event_attendance row.
    if (body.attended) {
      const { error } = await adminClient.from("event_attendance").upsert(
        { user_id: body.userId, trip_id: body.tripId, source: "admin" },
        { onConflict: "user_id,trip_id", ignoreDuplicates: true },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await adminClient
        .from("event_attendance")
        .delete()
        .eq("trip_id", body.tripId)
        .eq("user_id", body.userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
