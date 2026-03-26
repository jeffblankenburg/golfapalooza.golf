import { createClient } from "@/lib/supabase/server";
import { RoomList } from "@/components/RoomList";

export default async function RoomsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
        <p className="text-gray-500 text-center py-8">
          Room assignments haven&apos;t been set up yet.
        </p>
      </div>
    );
  }

  // Get facilities linked to this trip
  const { data: tripFacilities } = await supabase
    .from("trip_facilities")
    .select("facility_id")
    .eq("trip_id", trip.id);

  const linkedFacilityIds = (tripFacilities || []).map((tf) => tf.facility_id);

  if (linkedFacilityIds.length === 0) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
        <p className="text-gray-500 text-center py-8">
          Room assignments haven&apos;t been set up yet.
        </p>
      </div>
    );
  }

  // Get facilities and rooms for linked facilities
  const [facilitiesResult, roomsResult] = await Promise.all([
    supabase
      .from("facilities")
      .select("id, name, sort_order")
      .in("id", linkedFacilityIds)
      .order("sort_order"),
    supabase
      .from("rooms")
      .select(
        "id, room_number, facility_id, smoking, showers, bed_type, room_assignments(user_id, trip_id, user:users(id, display_name, avatar_url))"
      )
      .in("facility_id", linkedFacilityIds)
      .order("room_number"),
  ]);

  // Filter room_assignments to only this trip
  const rooms = (roomsResult.data || []).map((room) => ({
    ...room,
    room_assignments: (room.room_assignments || []).filter(
      (a: { trip_id: string | null }) => a.trip_id === trip.id
    ),
  }));

  return (
    <RoomList
      rooms={rooms}
      facilities={facilitiesResult.data || []}
      currentUserId={user!.id}
    />
  );
}
