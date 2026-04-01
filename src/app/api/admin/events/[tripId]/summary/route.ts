import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyEventAccess } from "@/lib/permissions-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const admin = await checkAnyEventAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tripId } = await params;
  const adminClient = createAdminClient();

  // Fetch trip details and all counts in parallel
  const [
    tripResult,
    participantsResult,
    contestsResult,
    scrambleDaysResult,
    itineraryResult,
    facilitiesResult,
    actionItemsResult,
    accoladesResult,
    contestTypesResult,
    eventDaysResult,
  ] = await Promise.all([
    adminClient
      .from("trip_settings")
      .select("*, course:courses(name)")
      .eq("id", tripId)
      .single(),
    adminClient
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("contests")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("contests")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .eq("contest_type", "scramble"),
    adminClient
      .from("itinerary_items")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("trip_facilities")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("accolades")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    adminClient
      .from("contests")
      .select("contest_type")
      .eq("trip_id", tripId),
    adminClient
      .from("event_days")
      .select("*")
      .eq("trip_id", tripId)
      .order("day_number"),
  ]);

  if (tripResult.error) {
    return NextResponse.json({ error: tripResult.error.message }, { status: 500 });
  }

  const trip = tripResult.data;
  const courseName = trip.course
    ? (Array.isArray(trip.course) ? trip.course[0]?.name : trip.course.name)
    : null;

  // Deduplicate contest types
  const contestTypes = [
    ...new Set(
      contestTypesResult.data?.map((c: { contest_type: string }) => c.contest_type) || []
    ),
  ];

  // Compute dates for event days
  const startDate = trip.start_date;
  const eventDays = (eventDaysResult.data || []).map(
    (d: { id: string; day_number: number; name: string }) => ({
      id: d.id,
      day_number: d.day_number,
      name: d.name,
      date: startDate
        ? (() => {
            const dt = new Date(startDate + "T00:00:00");
            dt.setDate(dt.getDate() + d.day_number - 1);
            return dt.toISOString().split("T")[0];
          })()
        : null,
    })
  );

  return NextResponse.json({
    trip: {
      id: trip.id,
      trip_name: trip.trip_name,
      trip_year: trip.trip_year,
      start_date: trip.start_date,
      sim_date: trip.sim_date || null,
      status: trip.status,
      course_id: trip.course_id,
    },
    counts: {
      participants: participantsResult.count ?? 0,
      contests: contestsResult.count ?? 0,
      scramble_days: scrambleDaysResult.count ?? 0,
      itinerary_items: itineraryResult.count ?? 0,
      facilities_linked: facilitiesResult.count ?? 0,
      action_items: actionItemsResult.count ?? 0,
      accolades: accoladesResult.count ?? 0,
    },
    course_name: courseName,
    contest_types: contestTypes,
    event_days: eventDays,
  });
}
