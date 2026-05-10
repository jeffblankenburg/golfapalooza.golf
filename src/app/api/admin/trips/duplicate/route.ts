/**
 * @swagger
 * /api/admin/trips/duplicate:
 *   post:
 *     summary: Issue #85 — duplicate an event
 *     description: |
 *       Clones a source trip's full *structural* configuration into a new
 *       trip — contests, options, cost items, payout rows, notebook,
 *       itinerary, action items, tee time slots, etc. Per-person data
 *       (participants, scores, picks, bids, winners, completions, room
 *       assignments) is NOT copied. The new trip is created as
 *       'archived' by default; admin can promote to 'active' afterward.
 *     tags: [Admin]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_trip_id]
 *             properties:
 *               source_trip_id: { type: string, format: uuid }
 *               trip_name: { type: string }
 *               trip_year: { type: integer }
 *               start_date: { type: string, format: date }
 *               status:
 *                 type: string
 *                 enum: [archived, active, draft]
 *     responses:
 *       200: { description: New trip created with cloned structure }
 *       400: { description: Invalid request }
 *       401: { description: Unauthorized }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloneTrip } from "@/lib/trip-clone";

async function checkIsAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

export async function POST(request: Request) {
  if (!(await checkIsAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    source_trip_id?: string;
    trip_name?: string;
    trip_year?: number;
    start_date?: string;
    status?: "archived" | "active" | "draft";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.source_trip_id) {
    return NextResponse.json({ error: "source_trip_id is required" }, { status: 400 });
  }

  const targetStatus = body.status ?? "archived";
  if (!["archived", "active", "draft"].includes(targetStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // If duplicating as active, archive the existing active event first
  // (mirroring the behavior of POST /api/admin/trips for new events).
  if (targetStatus === "active") {
    await adminClient
      .from("trip_settings")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("status", "active");
  }

  try {
    const result = await cloneTrip(adminClient, body.source_trip_id, {
      status: targetStatus,
      tripName: body.trip_name,
      tripYear: body.trip_year,
      startDate: body.start_date,
    });
    return NextResponse.json({
      trip_id: result.newTripId,
      inserted: result.inserted,
      warnings: result.warnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
