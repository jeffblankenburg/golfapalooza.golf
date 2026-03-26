import { createClient } from "@/lib/supabase/server";
import { HomeContent } from "@/components/HomeContent";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user!.id)
    .single();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("*")
    .eq("status", "active")
    .single();

  // Fetch action item counts, RSVP status, and room assignment
  let incompleteActionCount = 0;
  let totalActionCount = 0;
  let rsvpLikelihood: number | null = null;
  let myRoomNumber: string | null = null;
  let myFacilityName: string | null = null;

  if (trip) {
    const [itemsResult, completionsResult, rsvpResult, roomResult] = await Promise.all([
      supabase
        .from("action_items")
        .select("id")
        .eq("trip_id", trip.id),
      supabase
        .from("user_action_completions")
        .select("action_item_id")
        .eq("user_id", user!.id),
      supabase
        .from("event_participants")
        .select("likelihood")
        .eq("trip_id", trip.id)
        .eq("user_id", user!.id)
        .maybeSingle(),
      supabase
        .from("room_assignments")
        .select("room:rooms(room_number, facility:facilities(name))")
        .eq("user_id", user!.id)
        .eq("trip_id", trip.id)
        .maybeSingle(),
    ]);

    const allItems = itemsResult.data || [];
    const completedIds = new Set(
      (completionsResult.data || []).map((c) => c.action_item_id)
    );
    totalActionCount = allItems.length;
    incompleteActionCount = allItems.filter((a) => !completedIds.has(a.id)).length;
    rsvpLikelihood = rsvpResult.data?.likelihood ?? null;

    if (roomResult.data?.room) {
      const room = Array.isArray(roomResult.data.room) ? roomResult.data.room[0] : roomResult.data.room;
      if (room) {
        myRoomNumber = room.room_number;
        const facility = Array.isArray(room.facility) ? room.facility[0] : room.facility;
        myFacilityName = facility?.name ?? null;
      }
    }
  }

  return (
    <HomeContent
      displayName={profile?.display_name || "Loozer"}
      trip={trip}
      incompleteActionCount={incompleteActionCount}
      totalActionCount={totalActionCount}
      rsvpLikelihood={rsvpLikelihood}
      myRoomNumber={myRoomNumber}
      myFacilityName={myFacilityName}
    />
  );
}
