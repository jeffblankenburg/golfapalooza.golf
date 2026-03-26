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
 * /api/admin/rooms/assignments:
 *   get:
 *     summary: List all event participants with room assignment status
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users with room assignments
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

  // Get event participants
  const { data: participants, error: partError } = await adminClient
    .from("event_participants")
    .select("user_id, user:users(id, display_name, full_name, avatar_url)")
    .eq("trip_id", tripId);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  // Get linked facility IDs for this trip
  const { data: tripFacilities } = await adminClient
    .from("trip_facilities")
    .select("facility_id")
    .eq("trip_id", tripId);

  const linkedFacilityIds = (tripFacilities || []).map((tf) => tf.facility_id);

  // Get rooms for linked facilities with assignments for this trip
  let rooms: { id: string; room_number: string; room_assignments: { user_id: string; trip_id: string | null }[] }[] = [];
  if (linkedFacilityIds.length > 0) {
    const { data: roomsData, error: roomsError } = await adminClient
      .from("rooms")
      .select("id, room_number, room_assignments(user_id, trip_id)")
      .in("facility_id", linkedFacilityIds);

    if (roomsError) {
      return NextResponse.json({ error: roomsError.message }, { status: 500 });
    }

    rooms = roomsData || [];
  }

  // Build a map of user_id -> { room_id, room_number } for this trip only
  const userRoomMap = new Map<string, { room_id: string; room_number: string }>();
  for (const room of rooms) {
    const assignments = Array.isArray(room.room_assignments)
      ? room.room_assignments
      : [];
    for (const a of assignments) {
      if (a.trip_id === tripId) {
        userRoomMap.set(a.user_id, {
          room_id: room.id,
          room_number: room.room_number,
        });
      }
    }
  }

  const users = (participants || []).map((p) => {
    const user = Array.isArray(p.user) ? p.user[0] : p.user;
    const roomInfo = userRoomMap.get(p.user_id);
    return {
      id: user?.id || p.user_id,
      display_name: user?.display_name || "Unknown",
      full_name: user?.full_name || null,
      avatar_url: user?.avatar_url || null,
      room_id: roomInfo?.room_id || null,
      room_number: roomInfo?.room_number || null,
    };
  });

  users.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ users });
}

/**
 * @swagger
 * /api/admin/rooms/assignments:
 *   post:
 *     summary: Assign user to a room for a specific trip (auto-removes from previous room)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User assigned to room
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { room_id, user_id, trip_id } = await request.json();

    if (!room_id || !user_id || !trip_id) {
      return NextResponse.json(
        { error: "room_id, user_id, and trip_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Remove user from any existing room assignment for this trip
    await adminClient
      .from("room_assignments")
      .delete()
      .eq("user_id", user_id)
      .eq("trip_id", trip_id);

    // Assign to new room with trip_id
    const { error } = await adminClient
      .from("room_assignments")
      .insert({ room_id, user_id, trip_id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Assign room error:", error);
    return NextResponse.json(
      { error: "Failed to assign room" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms/assignments:
 *   delete:
 *     summary: Remove user from a room
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: User removed from room
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { room_id, user_id, trip_id } = await request.json();

    if (!room_id || !user_id) {
      return NextResponse.json(
        { error: "room_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    let query = adminClient
      .from("room_assignments")
      .delete()
      .eq("room_id", room_id)
      .eq("user_id", user_id);

    if (trip_id) {
      query = query.eq("trip_id", trip_id);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove room assignment error:", error);
    return NextResponse.json(
      { error: "Failed to remove room assignment" },
      { status: 500 }
    );
  }
}
