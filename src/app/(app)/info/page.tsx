import { createClient } from "@/lib/supabase/server";
import { TripInfo } from "@/components/TripInfo";
import { PastEvents } from "@/components/PastEvents";
import { RsvpStatus } from "@/components/RsvpStatus";

export default async function InfoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("*")
    .eq("status", "active")
    .single();

  const { count: playerCount } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  let rsvpLikelihood: number | null = null;
  if (trip && user) {
    const { data: rsvp } = await supabase
      .from("event_participants")
      .select("likelihood")
      .eq("trip_id", trip.id)
      .eq("user_id", user.id)
      .maybeSingle();
    rsvpLikelihood = rsvp?.likelihood ?? null;
  }

  // Get archived events with accolades and itinerary
  const { data: archivedEvents } = await supabase
    .from("trip_settings")
    .select("*")
    .eq("status", "archived")
    .order("trip_year", { ascending: false });

  let pastEvents: Array<{
    id: string;
    trip_name: string;
    trip_year: number;
    start_date: string;
    location: string | null;
    hotel_name: string | null;
    accolades: Array<{ id: string; title: string; user: { display_name: string } | null }>;
    itinerary: Array<{
      id: string;
      title: string;
      location: string | null;
      day_number: number | null;
      start_date: string | null;
      start_time: string | null;
      end_date: string | null;
      end_time: string | null;
    }>;
  }> = [];

  if (archivedEvents && archivedEvents.length > 0) {
    const eventIds = archivedEvents.map((e) => e.id);

    const { data: accolades } = await supabase
      .from("accolades")
      .select("id, trip_id, title, sort_order, user:users(display_name)")
      .in("trip_id", eventIds)
      .order("sort_order", { ascending: true });

    const { data: itinerary } = await supabase
      .from("itinerary_items")
      .select("id, trip_id, title, location, day_number, start_date, start_time, end_date, end_time")
      .in("trip_id", eventIds)
      .order("day_number", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true });

    pastEvents = archivedEvents.map((event) => ({
      ...event,
      accolades: (accolades || []).filter((a) => a.trip_id === event.id),
      itinerary: (itinerary || []).filter((i) => i.trip_id === event.id),
    }));
  }

  return (
    <>
      <TripInfo trip={trip} playerCount={playerCount || 0} rsvpLikelihood={rsvpLikelihood} />
      {pastEvents.length > 0 && <PastEvents events={pastEvents} />}
    </>
  );
}
