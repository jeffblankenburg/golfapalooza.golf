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

// GET - Fetch tee time groups for a trip + day, with players and unassigned participants
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  const dayNumber = searchParams.get("day_number");

  if (!tripId || !dayNumber) {
    return NextResponse.json({ error: "trip_id and day_number are required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    const dayNum = parseInt(dayNumber);

    // Fetch tee time groups with players
    const { data: groups, error: groupsError } = await adminClient
      .from("tee_times")
      .select(
        "id, trip_id, day_number, tee_time, starting_hole, scramble_team_id, created_at, tee_time_players(id, user_id, user:users(id, display_name, avatar_url))"
      )
      .eq("trip_id", tripId)
      .eq("day_number", dayNum)
      .order("created_at");

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 });
    }

    // Check if this day has a scramble contest
    const { data: scrambleContest } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", tripId)
      .eq("day_number", dayNum)
      .eq("contest_type", "scramble")
      .maybeSingle();

    // If scramble day, fetch scramble teams with members
    let scrambleTeams: Array<{
      id: string;
      members: Array<{ user_id: string; display_name: string; avatar_url: string | null }>;
    }> = [];

    if (scrambleContest) {
      const { data: teams } = await adminClient
        .from("scramble_teams")
        .select("id, scramble_team_members(user_id, user:users(id, display_name, avatar_url))")
        .eq("contest_id", scrambleContest.id);

      scrambleTeams = (teams || []).map((team) => {
        const members = ((team as Record<string, unknown>).scramble_team_members as Array<{
          user_id: string;
          user: { id: string; display_name: string; avatar_url: string | null } | Array<{ id: string; display_name: string; avatar_url: string | null }> | null;
        }>).map((m) => {
          const u = Array.isArray(m.user) ? m.user[0] : m.user;
          return {
            user_id: m.user_id,
            display_name: u?.display_name || "Unknown",
            avatar_url: u?.avatar_url || null,
          };
        });
        return { id: team.id, members };
      });
    }

    // Fetch all event participants (the pool of available players) — for non-scramble days
    const { data: participants } = await adminClient
      .from("event_participants")
      .select("user_id, user:users(id, display_name, avatar_url)")
      .eq("trip_id", tripId);

    // Build set of assigned user IDs for this day (from tee_time_players)
    const assignedIds = new Set<string>();
    for (const group of groups || []) {
      for (const player of (group as Record<string, unknown>).tee_time_players as Array<{ user_id: string }>) {
        assignedIds.add(player.user_id);
      }
    }

    // Unassigned = event participants not in any group for this day
    const unassigned = (participants || [])
      .filter((p) => !assignedIds.has(p.user_id))
      .map((p) => {
        const user = Array.isArray(p.user) ? p.user[0] : p.user;
        return {
          user_id: p.user_id,
          display_name: user?.display_name || "Unknown",
          avatar_url: user?.avatar_url || null,
        };
      });

    // Normalize group players
    const normalizedGroups = (groups || []).map((group) => {
      const players = ((group as Record<string, unknown>).tee_time_players as Array<{
        id: string;
        user_id: string;
        user: { id: string; display_name: string; avatar_url: string | null } | Array<{ id: string; display_name: string; avatar_url: string | null }> | null;
      }>).map((p) => {
        const user = Array.isArray(p.user) ? p.user[0] : p.user;
        return {
          id: p.id,
          user_id: p.user_id,
          display_name: user?.display_name || "Unknown",
          avatar_url: user?.avatar_url || null,
        };
      });

      return {
        id: group.id,
        trip_id: group.trip_id,
        day_number: group.day_number,
        tee_time: group.tee_time,
        starting_hole: group.starting_hole,
        scramble_team_id: group.scramble_team_id,
        players,
      };
    });

    return NextResponse.json({ groups: normalizedGroups, unassigned, scramble_teams: scrambleTeams });
  } catch (error) {
    console.error("Get tee times error:", error);
    return NextResponse.json({ error: "Failed to load tee times" }, { status: 500 });
  }
}

// POST - Create a new empty tee time group
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, day_number } = await request.json();

    if (!trip_id || !day_number) {
      return NextResponse.json({ error: "trip_id and day_number are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: group, error } = await adminClient
      .from("tee_times")
      .insert({ trip_id, day_number })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error("Create tee time group error:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}

// PUT - Update tee time or starting hole
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tee_time_id, tee_time, starting_hole, scramble_team_id } = await request.json();

    if (!tee_time_id) {
      return NextResponse.json({ error: "tee_time_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (tee_time !== undefined) updates.tee_time = tee_time;
    if (starting_hole !== undefined) updates.starting_hole = starting_hole;
    if (scramble_team_id !== undefined) updates.scramble_team_id = scramble_team_id;

    const { error } = await adminClient
      .from("tee_times")
      .update(updates)
      .eq("id", tee_time_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tee time error:", error);
    return NextResponse.json({ error: "Failed to update tee time" }, { status: 500 });
  }
}

// DELETE - Delete a tee time group (cascade deletes players)
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tee_time_id } = await request.json();

    if (!tee_time_id) {
      return NextResponse.json({ error: "tee_time_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("tee_times")
      .delete()
      .eq("id", tee_time_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tee time group error:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
