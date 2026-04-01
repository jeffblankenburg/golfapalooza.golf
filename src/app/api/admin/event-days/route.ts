import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

/**
 * @swagger
 * /api/admin/event-days:
 *   get:
 *     summary: List event days for a trip
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event days list with computed dates
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const [daysResult, tripResult] = await Promise.all([
    adminClient
      .from("event_days")
      .select("*")
      .eq("trip_id", tripId)
      .order("day_number"),
    adminClient
      .from("trip_settings")
      .select("start_date")
      .eq("id", tripId)
      .single(),
  ]);

  if (daysResult.error) {
    return NextResponse.json({ error: daysResult.error.message }, { status: 500 });
  }

  const startDate = tripResult.data?.start_date;

  const days = daysResult.data?.map((d) => ({
    ...d,
    date: startDate ? addDays(startDate, d.day_number - 1) : null,
  }));

  return NextResponse.json({ days });
}

/**
 * @swagger
 * /api/admin/event-days:
 *   post:
 *     summary: Create a new event day
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Event day created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, name } = await request.json();

    if (!trip_id) {
      return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the next available day_number
    const { data: existing } = await adminClient
      .from("event_days")
      .select("day_number")
      .eq("trip_id", trip_id)
      .order("day_number", { ascending: false })
      .limit(1);

    const nextDayNumber = existing && existing.length > 0 ? existing[0].day_number + 1 : 1;

    const { data, error } = await adminClient
      .from("event_days")
      .insert({
        trip_id,
        day_number: nextDayNumber,
        name: name || `Day ${nextDayNumber}`,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ day: data });
  } catch (error) {
    console.error("Create event day error:", error);
    return NextResponse.json({ error: "Failed to create event day" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/event-days:
 *   put:
 *     summary: Update an event day
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Event day updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, name } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Event day id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;

    const { error } = await adminClient
      .from("event_days")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update event day error:", error);
    return NextResponse.json({ error: "Failed to update event day" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/admin/event-days:
 *   delete:
 *     summary: Delete an event day
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Event day deleted
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Event day id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the day details first
    const { data: day } = await adminClient
      .from("event_days")
      .select("trip_id, day_number")
      .eq("id", id)
      .single();

    if (!day) {
      return NextResponse.json({ error: "Event day not found" }, { status: 404 });
    }

    // Check for dependencies across tables that reference this day_number
    const [contests, teeTimes, itinerary, hundredFeet, dailyWinners] = await Promise.all([
      adminClient
        .from("contests")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", day.trip_id)
        .eq("day_number", day.day_number),
      adminClient
        .from("tee_times")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", day.trip_id)
        .eq("day_number", day.day_number),
      adminClient
        .from("itinerary_items")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", day.trip_id)
        .eq("day_number", day.day_number),
      adminClient
        .from("hundred_feet_scores")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", day.trip_id)
        .eq("day_number", day.day_number),
      adminClient
        .from("daily_contest_winners")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", day.trip_id)
        .eq("day_number", day.day_number),
    ]);

    const deps: string[] = [];
    if ((contests.count ?? 0) > 0) deps.push(`${contests.count} contest(s)`);
    if ((teeTimes.count ?? 0) > 0) deps.push(`${teeTimes.count} tee time(s)`);
    if ((itinerary.count ?? 0) > 0) deps.push(`${itinerary.count} itinerary item(s)`);
    if ((hundredFeet.count ?? 0) > 0) deps.push(`${hundredFeet.count} 100-feet score(s)`);
    if ((dailyWinners.count ?? 0) > 0) deps.push(`${dailyWinners.count} daily winner(s)`);

    if (deps.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete Day ${day.day_number}: has ${deps.join(", ")}` },
        { status: 409 }
      );
    }

    const { error } = await adminClient
      .from("event_days")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete event day error:", error);
    return NextResponse.json({ error: "Failed to delete event day" }, { status: 500 });
  }
}
