import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin, checkAnyEventAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/trips:
 *   get:
 *     summary: Get trip settings
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, all]
 *         description: Filter by status (default active)
 *     responses:
 *       200:
 *         description: Trip settings
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  // Allow any user with event permissions to list trips (read-only)
  const admin = await checkAnyEventAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const tripId = searchParams.get("id");

  const adminClient = createAdminClient();

  // Fetch a specific trip by ID
  if (tripId) {
    const { data: trip, error } = await adminClient
      .from("trip_settings")
      .select("*")
      .eq("id", tripId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ trip });
  }

  if (status === "all") {
    const { data: trips, error } = await adminClient
      .from("trip_settings")
      .select("*")
      .order("trip_year", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ trips });
  }

  const { data: trip, error } = await adminClient
    .from("trip_settings")
    .select("*")
    .eq("status", status)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trip });
}

/**
 * @swagger
 * /api/admin/trips:
 *   post:
 *     summary: Create a new event
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Event created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { trip_name, start_date, end_date, status: requestedStatus } = body;

    if (!trip_name || !start_date) {
      return NextResponse.json(
        { error: "Trip name and start date are required" },
        { status: 400 }
      );
    }

    const trip_year = body.trip_year || new Date(start_date).getFullYear();
    const adminClient = createAdminClient();
    const insertStatus = requestedStatus === "archived" ? "archived" : "active";

    // If creating as active, archive any existing active event first.
    if (insertStatus === "active") {
      await adminClient
        .from("trip_settings")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("status", "active");
    }

    const { data, error } = await adminClient
      .from("trip_settings")
      .insert({
        trip_name,
        trip_year,
        start_date,
        status: insertStatus,
        timezone: body.timezone || "America/New_York",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-seed event days based on date range with weekday names
    const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const startDt = new Date(start_date + "T00:00:00");
    const endDt = end_date ? new Date(end_date + "T00:00:00") : null;

    const dayCount = endDt
      ? Math.floor((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 4; // fallback for API calls without end_date

    const eventDaysToInsert = [];
    for (let i = 0; i < dayCount; i++) {
      const dt = new Date(startDt);
      dt.setDate(dt.getDate() + i);
      eventDaysToInsert.push({
        trip_id: data.id,
        day_number: i + 1,
        name: WEEKDAY_NAMES[dt.getDay()],
      });
    }
    await adminClient.from("event_days").insert(eventDaysToInsert);

    return NextResponse.json({ trip: data });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/trips:
 *   put:
 *     summary: Update trip settings
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Trip settings updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, trip_name, trip_year, start_date, location, hotel_name, hotel_address, notes, course_id, show_tee_times, show_teams, show_rooms, timezone, tee_time_reminder_minutes, visibility_overrides } = body;

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    if (!start_date) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("trip_settings")
      .update({
        trip_name: trip_name || "Golfapalooza",
        trip_year: trip_year || new Date(start_date).getFullYear(),
        start_date,
        location: location || null,
        hotel_name: hotel_name || null,
        hotel_address: hotel_address || null,
        notes: notes || null,
        ...(course_id !== undefined ? { course_id: course_id || null } : {}),
        ...(show_tee_times !== undefined ? { show_tee_times } : {}),
        ...(show_teams !== undefined ? { show_teams } : {}),
        ...(show_rooms !== undefined ? { show_rooms } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(tee_time_reminder_minutes !== undefined ? { tee_time_reminder_minutes } : {}),
        ...(visibility_overrides !== undefined ? { visibility_overrides } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update trip error:", error);
    return NextResponse.json({ error: "Failed to update trip settings" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/trips:
 *   patch:
 *     summary: Archive an event
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Event archived
 *       401:
 *         description: Unauthorized
 */
export async function PATCH(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, status: newStatus } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Trip ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const targetStatus = newStatus === "active" ? "active" : "archived";

    // If setting to active, archive any currently active event first
    if (targetStatus === "active") {
      await adminClient
        .from("trip_settings")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("status", "active");
    }

    const { error } = await adminClient
      .from("trip_settings")
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update event status error:", error);
    return NextResponse.json({ error: "Failed to update event status" }, { status: 500 });
  }
}
