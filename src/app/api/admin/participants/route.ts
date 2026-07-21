import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin, checkAnyEventAccess } from "@/lib/permissions-server";
import { cascadeRemoveFromRoster } from "@/lib/roster";

/**
 * @swagger
 * /api/admin/participants:
 *   get:
 *     summary: List all users with participation status for an event
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users with participation status
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  // Read the event roster for any event-permission holder (e.g. a manage_pickem
  // helper needs it to enroll pickem participants). Add/remove below stay admin.
  const admin = await checkAnyEventAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("trip_id");

    if (!tripId) {
      return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get all users — excludes bots (is_system=true) and financial-only
    // accounts; both are never real participants in an event.
    const { data: users, error: usersError } = await adminClient
      .from("users")
      .select("id, display_name, full_name, avatar_url")
      .eq("is_financial_only", false)
      .eq("is_system", false)
      .order("display_name");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get participants for this event
    const { data: participants } = await adminClient
      .from("event_participants")
      .select("user_id, likelihood, on_roster")
      .eq("trip_id", tripId);

    const participantMap = new Map(
      (participants || []).map((p) => [
        p.user_id,
        { likelihood: p.likelihood as number | null, on_roster: p.on_roster as boolean },
      ])
    );

    const usersWithStatus = users?.map((u) => {
      const ep = participantMap.get(u.id);
      return {
        ...u,
        is_participating: ep?.on_roster ?? false,
        likelihood: ep?.likelihood ?? null,
      };
    });

    return NextResponse.json({ users: usersWithStatus });
  } catch (error) {
    console.error("Get participants error:", error);
    return NextResponse.json(
      { error: "Failed to load participants" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/participants:
 *   post:
 *     summary: Add participant to event and all contests
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant added
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, user_id } = await request.json();

    if (!trip_id || !user_id) {
      return NextResponse.json(
        { error: "trip_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Add to event participants (set on_roster = true)
    const { error: insertError } = await adminClient
      .from("event_participants")
      .upsert({ trip_id, user_id, on_roster: true }, { onConflict: "trip_id,user_id" });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Auto-add to event chat room
    const { data: eventRoom } = await adminClient
      .from("chat_rooms")
      .select("id")
      .eq("trip_id", trip_id)
      .single();

    if (eventRoom) {
      await adminClient
        .from("chat_room_members")
        .upsert(
          { room_id: eventRoom.id, user_id },
          { onConflict: "room_id,user_id" }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add participant error:", error);
    return NextResponse.json(
      { error: "Failed to add participant" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/participants:
 *   delete:
 *     summary: Remove participant from event and all contests
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant removed
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, user_id } = await request.json();

    if (!trip_id || !user_id) {
      return NextResponse.json(
        { error: "trip_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Cascade remove from all contests, teams, tee times, rooms, chat
    await cascadeRemoveFromRoster(trip_id, user_id);

    // Set on_roster = false (keep the row for RSVP tracking)
    const { error } = await adminClient
      .from("event_participants")
      .update({ on_roster: false })
      .eq("trip_id", trip_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove participant error:", error);
    return NextResponse.json(
      { error: "Failed to remove participant" },
      { status: 500 }
    );
  }
}
