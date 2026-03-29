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

// GET - Full Ryder Cup state for a contest
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Fetch teams
    const { data: teams, error: teamsError } = await adminClient
      .from("ryder_cup_teams")
      .select("id, contest_id, team_number, team_name")
      .eq("contest_id", contestId)
      .order("team_number");

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // If no teams exist yet, auto-seed them
    if (!teams || teams.length === 0) {
      const rows = [
        { contest_id: contestId, team_number: 1, team_name: "Team 1" },
        { contest_id: contestId, team_number: 2, team_name: "Team 2" },
      ];
      const { data: seeded, error: seedError } = await adminClient
        .from("ryder_cup_teams")
        .insert(rows)
        .select("id, contest_id, team_number, team_name");

      if (seedError) {
        return NextResponse.json({ error: seedError.message }, { status: 500 });
      }

      // Use the freshly seeded teams
      const freshTeams = seeded || [];
      return NextResponse.json({
        teams: freshTeams.map((t) => ({ ...t, pairs: [] })),
        foursomes: [],
        unassigned: await getUnassigned(adminClient, contestId, []),
      });
    }

    const teamIds = teams.map((t) => t.id);

    // Fetch pairs with player info
    const { data: pairs } = await adminClient
      .from("ryder_cup_pairs")
      .select(
        "id, team_id, player_a_id, player_b_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, full_name, avatar_url), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, full_name, avatar_url)"
      )
      .in("team_id", teamIds)
      .order("sort_order");

    // Fetch foursomes
    const { data: foursomes } = await adminClient
      .from("ryder_cup_foursomes")
      .select("id, contest_id, pair_team1_id, pair_team2_id, sort_order")
      .eq("contest_id", contestId)
      .order("sort_order");

    // Normalize pairs
    const normalizedPairs = (pairs || []).map((p) => {
      const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
      const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
      return {
        id: p.id,
        team_id: p.team_id,
        sort_order: p.sort_order,
        player_a: playerA ? { id: playerA.id, display_name: playerA.display_name, full_name: playerA.full_name, avatar_url: playerA.avatar_url } : null,
        player_b: playerB ? { id: playerB.id, display_name: playerB.display_name, full_name: playerB.full_name, avatar_url: playerB.avatar_url } : null,
      };
    });

    // Group pairs by team
    const pairsByTeam: Record<string, typeof normalizedPairs> = {};
    for (const pair of normalizedPairs) {
      if (!pairsByTeam[pair.team_id]) pairsByTeam[pair.team_id] = [];
      pairsByTeam[pair.team_id].push(pair);
    }

    const teamsWithPairs = teams.map((t) => ({
      ...t,
      pairs: pairsByTeam[t.id] || [],
    }));

    // Collect assigned player IDs from pairs
    const assignedIds = new Set<string>();
    for (const pair of normalizedPairs) {
      if (pair.player_a) assignedIds.add(pair.player_a.id);
      if (pair.player_b) assignedIds.add(pair.player_b.id);
    }

    const unassigned = await getUnassigned(adminClient, contestId, Array.from(assignedIds));

    return NextResponse.json({
      teams: teamsWithPairs,
      foursomes: foursomes || [],
      unassigned,
    });
  } catch (error) {
    console.error("Get ryder cup state error:", error);
    return NextResponse.json({ error: "Failed to load ryder cup data" }, { status: 500 });
  }
}

async function getUnassigned(
  adminClient: ReturnType<typeof createAdminClient>,
  contestId: string,
  assignedIds: string[]
) {
  const { data: participants } = await adminClient
    .from("contest_participants")
    .select("user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
    .eq("contest_id", contestId);

  return (participants || [])
    .filter((p) => !assignedIds.includes(p.user_id))
    .map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        user_id: p.user_id,
        display_name: user?.display_name || "Unknown",
        full_name: user?.full_name || null,
        avatar_url: user?.avatar_url || null,
      };
    });
}

// PUT - Update team name
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, team_name } = await request.json();

    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("ryder_cup_teams")
      .update({ team_name })
      .eq("id", team_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update ryder cup team error:", error);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}
