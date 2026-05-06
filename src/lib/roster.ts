import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Remove a user from all contests, teams, tee times, rooms, and chat
 * for a given trip. Does NOT remove the event_participants row itself.
 */
export async function cascadeRemoveFromRoster(tripId: string, userId: string) {
  const adminClient = createAdminClient();

  // Get all contest IDs for this trip
  const { data: contests } = await adminClient
    .from("contests")
    .select("id")
    .eq("trip_id", tripId);

  const contestIds = (contests || []).map((c) => c.id);

  if (contestIds.length > 0) {
    // Remove from scramble teams
    const { data: scrambleTeams } = await adminClient
      .from("scramble_teams")
      .select("id")
      .in("contest_id", contestIds);

    if (scrambleTeams && scrambleTeams.length > 0) {
      await adminClient
        .from("scramble_team_members")
        .delete()
        .in("team_id", scrambleTeams.map((t) => t.id))
        .eq("user_id", userId);
    }

    // Remove from cornhole teams
    const { data: cornholeTeams } = await adminClient
      .from("cornhole_teams")
      .select("id")
      .in("contest_id", contestIds);

    if (cornholeTeams && cornholeTeams.length > 0) {
      await adminClient
        .from("cornhole_team_members")
        .delete()
        .in("team_id", cornholeTeams.map((t) => t.id))
        .eq("user_id", userId);
    }

    // Clear from ryder cup pairs (SET NULL, not delete)
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
        .eq("player_a_id", userId);
      await adminClient
        .from("ryder_cup_pairs")
        .update({ player_b_id: null })
        .in("team_id", ryderTeamIds)
        .eq("player_b_id", userId);
      await adminClient
        .from("ryder_cup_pairs")
        .update({ player_c_id: null })
        .in("team_id", ryderTeamIds)
        .eq("player_c_id", userId);
    }

    // Remove from contest participants
    await adminClient
      .from("contest_participants")
      .delete()
      .in("contest_id", contestIds)
      .eq("user_id", userId);
  }

  // Remove from tee times
  const { data: teeTimes } = await adminClient
    .from("tee_times")
    .select("id")
    .eq("trip_id", tripId);

  if (teeTimes && teeTimes.length > 0) {
    await adminClient
      .from("tee_time_players")
      .delete()
      .in("tee_time_id", teeTimes.map((t) => t.id))
      .eq("user_id", userId);
  }

  // Remove from room assignments
  const { data: rooms } = await adminClient
    .from("rooms")
    .select("id")
    .eq("trip_id", tripId);

  if (rooms && rooms.length > 0) {
    await adminClient
      .from("room_assignments")
      .delete()
      .in("room_id", rooms.map((r) => r.id))
      .eq("user_id", userId);
  }

  // Remove from event chat room
  const { data: eventRoom } = await adminClient
    .from("chat_rooms")
    .select("id")
    .eq("trip_id", tripId)
    .single();

  if (eventRoom) {
    await adminClient
      .from("chat_room_members")
      .delete()
      .eq("room_id", eventRoom.id)
      .eq("user_id", userId);
  }
}

/**
 * Add a user to all contests and event chat for a given trip.
 */
export async function addToContestsAndChat(tripId: string, userId: string) {
  const adminClient = createAdminClient();

  // Add to all contests
  const { data: contests } = await adminClient
    .from("contests")
    .select("id")
    .eq("trip_id", tripId);

  if (contests && contests.length > 0) {
    const entries = contests.map((c) => ({
      contest_id: c.id,
      user_id: userId,
    }));
    await adminClient
      .from("contest_participants")
      .upsert(entries, { onConflict: "contest_id,user_id" });
  }

  // Add to event chat room
  const { data: eventRoom } = await adminClient
    .from("chat_rooms")
    .select("id")
    .eq("trip_id", tripId)
    .single();

  if (eventRoom) {
    await adminClient
      .from("chat_room_members")
      .upsert(
        { room_id: eventRoom.id, user_id: userId },
        { onConflict: "room_id,user_id" }
      );
  }
}
