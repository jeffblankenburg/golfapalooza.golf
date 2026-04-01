import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

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
  const admin = await checkIsAdmin();
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

    // Get all users
    const { data: users, error: usersError } = await adminClient
      .from("users")
      .select("id, display_name, full_name, avatar_url")
      .order("display_name");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get participants for this event (try with likelihood, fall back without)
    let participantMap = new Map<string, number | null>();

    const { data: participants, error: partError } = await adminClient
      .from("event_participants")
      .select("user_id, likelihood")
      .eq("trip_id", tripId);

    if (partError) {
      // likelihood column may not exist yet — fall back to user_id only
      const { data: fallback } = await adminClient
        .from("event_participants")
        .select("user_id")
        .eq("trip_id", tripId);

      participantMap = new Map(
        fallback?.map((p) => [p.user_id, null]) || []
      );
    } else {
      participantMap = new Map(
        participants?.map((p) => [p.user_id, (p as Record<string, unknown>).likelihood as number | null]) || []
      );
    }

    const usersWithStatus = users?.map((u) => ({
      ...u,
      is_participating: participantMap.has(u.id),
      likelihood: participantMap.get(u.id) ?? null,
    }));

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

    // Add to event participants
    const { error: insertError } = await adminClient
      .from("event_participants")
      .upsert({ trip_id, user_id }, { onConflict: "trip_id,user_id" });

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

    // Get all contest IDs for this trip
    const { data: contests } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id);

    const contestIds = (contests || []).map((c) => c.id);

    if (contestIds.length > 0) {
      // Remove from scramble teams in this trip's contests
      const { data: scrambleTeams } = await adminClient
        .from("scramble_teams")
        .select("id")
        .in("contest_id", contestIds);

      if (scrambleTeams && scrambleTeams.length > 0) {
        const scrambleTeamIds = scrambleTeams.map((t) => t.id);
        await adminClient
          .from("scramble_team_members")
          .delete()
          .in("team_id", scrambleTeamIds)
          .eq("user_id", user_id);
      }

      // Remove from cornhole teams in this trip's contests
      const { data: cornholeTeams } = await adminClient
        .from("cornhole_teams")
        .select("id")
        .in("contest_id", contestIds);

      if (cornholeTeams && cornholeTeams.length > 0) {
        const cornholeTeamIds = cornholeTeams.map((t) => t.id);
        await adminClient
          .from("cornhole_team_members")
          .delete()
          .in("team_id", cornholeTeamIds)
          .eq("user_id", user_id);
      }

      // Clear from ryder cup pairs (SET NULL, not delete — pair structure stays)
      const { data: ryderTeams } = await adminClient
        .from("ryder_cup_teams")
        .select("id")
        .in("contest_id", contestIds);

      if (ryderTeams && ryderTeams.length > 0) {
        const ryderTeamIds = ryderTeams.map((t) => t.id);
        await adminClient
          .from("ryder_cup_pairs")
          .update({ player_a_id: null })
          .in("team_id", ryderTeamIds)
          .eq("player_a_id", user_id);
        await adminClient
          .from("ryder_cup_pairs")
          .update({ player_b_id: null })
          .in("team_id", ryderTeamIds)
          .eq("player_b_id", user_id);
      }

      // Remove from contest participants
      await adminClient
        .from("contest_participants")
        .delete()
        .in("contest_id", contestIds)
        .eq("user_id", user_id);
    }

    // Remove from tee times for this trip
    const { data: teeTimes } = await adminClient
      .from("tee_times")
      .select("id")
      .eq("trip_id", trip_id);

    if (teeTimes && teeTimes.length > 0) {
      const teeTimeIds = teeTimes.map((t) => t.id);
      await adminClient
        .from("tee_time_players")
        .delete()
        .in("tee_time_id", teeTimeIds)
        .eq("user_id", user_id);
    }

    // Remove from room assignments for this trip
    const { data: rooms } = await adminClient
      .from("rooms")
      .select("id")
      .eq("trip_id", trip_id);

    if (rooms && rooms.length > 0) {
      const roomIds = rooms.map((r) => r.id);
      await adminClient
        .from("room_assignments")
        .delete()
        .in("room_id", roomIds)
        .eq("user_id", user_id);
    }

    // Remove from event chat room
    const { data: eventRoom } = await adminClient
      .from("chat_rooms")
      .select("id")
      .eq("trip_id", trip_id)
      .single();

    if (eventRoom) {
      await adminClient
        .from("chat_room_members")
        .delete()
        .eq("room_id", eventRoom.id)
        .eq("user_id", user_id);
    }

    // Remove from event participants
    const { error } = await adminClient
      .from("event_participants")
      .delete()
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
