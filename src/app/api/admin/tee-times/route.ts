import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { deriveFoursomes } from "@/lib/kgb-cup/derive-foursomes";

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

    // Check if this day has scramble or ryder_cup contests — parallel
    const [scrambleContestResult, ryderCupContestResult] = await Promise.all([
      adminClient
        .from("contests")
        .select("id")
        .eq("trip_id", tripId)
        .eq("day_number", dayNum)
        .eq("contest_type", "scramble")
        .maybeSingle(),
      adminClient
        .from("contests")
        .select("id")
        .eq("trip_id", tripId)
        .eq("day_number", dayNum)
        .eq("contest_type", "ryder_cup")
        .maybeSingle(),
    ]);

    const scrambleContest = scrambleContestResult.data;
    const ryderCupContest = ryderCupContestResult.data;

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

    // If KGB Cup day, derive foursomes from pairs
    let kgbFoursomes: Array<{
      id: string;
      sort_order: number;
      members: Array<{ user_id: string; display_name: string; avatar_url: string | null; team_color: string | null }>;
    }> = [];

    if (ryderCupContest) {
      // Fetch teams for colors and team_number
      const { data: rcTeams } = await adminClient
        .from("ryder_cup_teams")
        .select("id, team_number, team_color")
        .eq("contest_id", ryderCupContest.id);

      const teamColorMap = new Map<string, string | null>();
      for (const t of rcTeams || []) {
        teamColorMap.set(t.id, t.team_color);
      }

      // Fetch all pairs with player info
      const rcTeamIds = (rcTeams || []).map((t) => t.id);
      const { data: rcPairs } = rcTeamIds.length > 0
        ? await adminClient
            .from("ryder_cup_pairs")
            .select("id, team_id, sort_order, player_a_id, player_b_id, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, avatar_url), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, avatar_url)")
            .in("team_id", rcTeamIds)
        : { data: [] };

      // Build pair lookup
      const pairLookup = new Map<string, { team_id: string; players: Array<{ user_id: string; display_name: string; avatar_url: string | null }> }>();
      for (const p of rcPairs || []) {
        const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
        const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
        const players: Array<{ user_id: string; display_name: string; avatar_url: string | null }> = [];
        if (playerA) players.push({ user_id: playerA.id, display_name: playerA.display_name, avatar_url: playerA.avatar_url });
        if (playerB) players.push({ user_id: playerB.id, display_name: playerB.display_name, avatar_url: playerB.avatar_url });
        pairLookup.set(p.id, { team_id: p.team_id, players });
      }

      // Derive foursomes from pairs by matching sort_order
      const derived = deriveFoursomes(rcPairs || [], rcTeams || []);

      kgbFoursomes = derived.map((f) => {
        const pair1 = pairLookup.get(f.pair_team1_id);
        const pair2 = pairLookup.get(f.pair_team2_id);
        const members: Array<{ user_id: string; display_name: string; avatar_url: string | null; team_color: string | null }> = [];

        for (const p of pair1?.players || []) {
          members.push({ ...p, team_color: teamColorMap.get(pair1!.team_id) || null });
        }
        for (const p of pair2?.players || []) {
          members.push({ ...p, team_color: teamColorMap.get(pair2!.team_id) || null });
        }

        return { id: f.id, sort_order: f.sort_order, members };
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

    return NextResponse.json({ groups: normalizedGroups, unassigned, scramble_teams: scrambleTeams, kgb_foursomes: kgbFoursomes });
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
    const { trip_id, day_number, kgb_foursome_id } = await request.json();

    if (!trip_id || !day_number) {
      return NextResponse.json({ error: "trip_id and day_number are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: group, error } = await adminClient
      .from("tee_times")
      .insert({ trip_id, day_number, starting_hole: 1 })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If kgb_foursome_id provided (= team1 pair ID), auto-populate tee_time_players
    if (kgb_foursome_id && group) {
      // Fetch pair + its team info in one query (join)
      const { data: team1Pair } = await adminClient
        .from("ryder_cup_pairs")
        .select("id, team_id, sort_order, player_a_id, player_b_id, team:ryder_cup_teams!inner(id, contest_id)")
        .eq("id", kgb_foursome_id)
        .single();

      if (team1Pair) {
        const team1Info = Array.isArray(team1Pair.team) ? team1Pair.team[0] : team1Pair.team;

        // Fetch opposing team + matching pair in parallel
        const [team2Result, _] = await Promise.all([
          adminClient
            .from("ryder_cup_teams")
            .select("id")
            .eq("contest_id", team1Info.contest_id)
            .neq("id", team1Info.id)
            .single(),
          Promise.resolve(null),
        ]);

        let team2Pair: { player_a_id: string | null; player_b_id: string | null } | null = null;
        if (team2Result.data) {
          const { data: p2 } = await adminClient
            .from("ryder_cup_pairs")
            .select("player_a_id, player_b_id")
            .eq("team_id", team2Result.data.id)
            .eq("sort_order", team1Pair.sort_order)
            .single();
          team2Pair = p2;
        }

        const playerIds: string[] = [];
        if (team1Pair.player_a_id) playerIds.push(team1Pair.player_a_id);
        if (team1Pair.player_b_id) playerIds.push(team1Pair.player_b_id);
        if (team2Pair?.player_a_id) playerIds.push(team2Pair.player_a_id);
        if (team2Pair?.player_b_id) playerIds.push(team2Pair.player_b_id);

        if (playerIds.length > 0) {
          await adminClient
            .from("tee_time_players")
            .insert(playerIds.map((uid) => ({ tee_time_id: group.id, user_id: uid })));
        }
      }
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
