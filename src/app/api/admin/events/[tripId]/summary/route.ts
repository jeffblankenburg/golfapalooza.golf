import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;

  return user;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const admin = await checkIsAdmin();
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
    itineraryResult,
    facilitiesResult,
    actionItemsResult,
    accoladesResult,
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
  ]);

  if (tripResult.error) {
    return NextResponse.json({ error: tripResult.error.message }, { status: 500 });
  }

  const trip = tripResult.data;
  const courseName = trip.course
    ? (Array.isArray(trip.course) ? trip.course[0]?.name : trip.course.name)
    : null;

  return NextResponse.json({
    trip: {
      id: trip.id,
      trip_name: trip.trip_name,
      trip_year: trip.trip_year,
      start_date: trip.start_date,
      status: trip.status,
      course_id: trip.course_id,
    },
    counts: {
      participants: participantsResult.count ?? 0,
      contests: contestsResult.count ?? 0,
      itinerary_items: itineraryResult.count ?? 0,
      facilities_linked: facilitiesResult.count ?? 0,
      action_items: actionItemsResult.count ?? 0,
      accolades: accoladesResult.count ?? 0,
    },
    course_name: courseName,
  });
}
