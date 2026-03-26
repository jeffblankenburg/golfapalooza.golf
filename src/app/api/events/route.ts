import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all archived events
  const { data: events, error } = await supabase
    .from("trip_settings")
    .select("*")
    .eq("status", "archived")
    .order("trip_year", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // Get accolades for all archived events with user names
  const eventIds = events.map((e) => e.id);
  const { data: accolades } = await supabase
    .from("accolades")
    .select("*, user:users(id, display_name)")
    .in("trip_id", eventIds)
    .order("sort_order", { ascending: true });

  // Get itinerary for all archived events
  const { data: itinerary } = await supabase
    .from("itinerary_items")
    .select("id, trip_id, title, location, day_number, start_date, start_time, end_date, end_time")
    .in("trip_id", eventIds)
    .order("day_number", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  // Group by event
  const enriched = events.map((event) => ({
    ...event,
    accolades: (accolades || []).filter((a) => a.trip_id === event.id),
    itinerary: (itinerary || []).filter((i) => i.trip_id === event.id),
  }));

  return NextResponse.json({ events: enriched });
}
