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

/**
 * @swagger
 * /api/admin/rooms:
 *   get:
 *     summary: List rooms for an event's facilities with occupant details
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rooms list with occupants, plus all facilities
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
  const facilityId = searchParams.get("facility_id");

  const adminClient = createAdminClient();

  // Standalone mode: fetch rooms for a specific facility (no trip context)
  if (facilityId) {
    const { data: rooms, error } = await adminClient
      .from("rooms")
      .select("id, room_number, facility_id, smoking, showers, bed_type")
      .eq("facility_id", facilityId)
      .order("room_number");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rooms: rooms || [] });
  }

  if (!tripId) {
    return NextResponse.json({ error: "trip_id or facility_id is required" }, { status: 400 });
  }

  // Get all facilities (standalone) and which ones are linked to this trip
  const [allFacilitiesResult, tripFacilitiesResult] = await Promise.all([
    adminClient
      .from("facilities")
      .select("id, name, sort_order")
      .order("sort_order"),
    adminClient
      .from("trip_facilities")
      .select("facility_id")
      .eq("trip_id", tripId),
  ]);

  if (allFacilitiesResult.error) {
    return NextResponse.json({ error: allFacilitiesResult.error.message }, { status: 500 });
  }

  const linkedFacilityIds = new Set(
    (tripFacilitiesResult.data || []).map((tf) => tf.facility_id)
  );

  // Get rooms for linked facilities with assignments for THIS trip
  let rooms: typeof roomsResult.data = [];
  if (linkedFacilityIds.size > 0) {
    var roomsResult = await adminClient
      .from("rooms")
      .select(
        "id, room_number, facility_id, smoking, showers, bed_type, room_assignments!left(id, user_id, trip_id, user:users(id, display_name, full_name, avatar_url))"
      )
      .in("facility_id", Array.from(linkedFacilityIds))
      .order("room_number");

    if (roomsResult.error) {
      return NextResponse.json({ error: roomsResult.error.message }, { status: 500 });
    }

    // Filter assignments to only this trip
    rooms = (roomsResult.data || []).map((room) => ({
      ...room,
      room_assignments: (room.room_assignments || []).filter(
        (a: { trip_id: string | null }) => a.trip_id === tripId
      ),
    }));
  }

  return NextResponse.json({
    rooms,
    facilities: allFacilitiesResult.data || [],
    linkedFacilityIds: Array.from(linkedFacilityIds),
  });
}

/**
 * @swagger
 * /api/admin/rooms:
 *   post:
 *     summary: Create a new room in a facility
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Room created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { room_number, facility_id, smoking, showers, bed_type } =
      await request.json();

    if (!facility_id || !room_number) {
      return NextResponse.json(
        { error: "facility_id and room_number are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("rooms")
      .insert({
        room_number: room_number.trim(),
        facility_id,
        smoking: smoking ?? false,
        showers: showers ?? 1,
        bed_type: bed_type || "Double",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A room with that number already exists in this facility" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ room: data });
  } catch (error) {
    console.error("Create room error:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms:
 *   put:
 *     summary: Update room properties
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Room updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, smoking, showers, bed_type } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Room id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("rooms")
      .update({
        smoking: smoking ?? false,
        showers: showers ?? 1,
        bed_type: bed_type || "Double",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update room error:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms:
 *   delete:
 *     summary: Delete a room (cascades assignments)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Room deleted
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
      return NextResponse.json(
        { error: "Room id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient.from("rooms").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete room error:", error);
    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 }
    );
  }
}
