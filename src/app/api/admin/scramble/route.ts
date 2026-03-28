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

// GET - Fetch teams for a contest, with members, plus unassigned participants
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

    // Fetch teams with members
    const { data: teams, error: teamsError } = await adminClient
      .from("scramble_teams")
      .select(
        "id, contest_id, team_handicap, gross_score, course_par, created_at, scramble_team_members(id, user_id, user:users(id, display_name, full_name, avatar_url))"
      )
      .eq("contest_id", contestId)
      .order("created_at");

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // Fetch contest to get trip_id
    const { data: contest } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Fetch all contest participants (the pool of available players)
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select("user_id, user:users(id, display_name, full_name, avatar_url)")
      .eq("contest_id", contestId);

    // Build set of assigned user IDs
    const assignedIds = new Set<string>();
    for (const team of teams || []) {
      for (const member of (team as Record<string, unknown>).scramble_team_members as Array<{ user_id: string }>) {
        assignedIds.add(member.user_id);
      }
    }

    // Unassigned = contest participants not on any team
    const unassigned = (participants || [])
      .filter((p) => !assignedIds.has(p.user_id))
      .map((p) => {
        const user = Array.isArray(p.user) ? p.user[0] : p.user;
        return {
          user_id: p.user_id,
          display_name: user?.display_name || "Unknown",
          full_name: user?.full_name || null,
          avatar_url: user?.avatar_url || null,
        };
      });

    // Get course par from the trip's linked course
    const { data: tripData } = await adminClient
      .from("trip_settings")
      .select("course_id")
      .eq("id", contest.trip_id)
      .single();

    let coursePar = 72;
    if (tripData?.course_id) {
      const { data: tees } = await adminClient
        .from("course_tees")
        .select("par")
        .eq("course_id", tripData.course_id)
        .limit(1);

      if (tees && tees.length > 0 && tees[0].par) {
        coursePar = tees[0].par;
      }
    }

    // Normalize team members
    const normalizedTeams = (teams || []).map((team) => {
      const members = ((team as Record<string, unknown>).scramble_team_members as Array<{
        id: string;
        user_id: string;
        user: { id: string; display_name: string; full_name: string | null; avatar_url: string | null } | Array<{ id: string; display_name: string; full_name: string | null; avatar_url: string | null }> | null;
      }>).map((m) => {
        const user = Array.isArray(m.user) ? m.user[0] : m.user;
        return {
          id: m.id,
          user_id: m.user_id,
          display_name: user?.display_name || "Unknown",
          full_name: user?.full_name || null,
          avatar_url: user?.avatar_url || null,
        };
      });

      return {
        id: team.id,
        contest_id: team.contest_id,
        team_handicap: team.team_handicap,
        gross_score: team.gross_score,
        course_par: team.course_par,
        members,
      };
    });

    return NextResponse.json({ teams: normalizedTeams, unassigned, course_par: coursePar });
  } catch (error) {
    console.error("Get scramble teams error:", error);
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
  }
}

// POST - Create a new empty team
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, course_par } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: team, error } = await adminClient
      .from("scramble_teams")
      .insert({
        contest_id,
        course_par: course_par || 72,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Create scramble team error:", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

// PUT - Update team handicap, gross score, or course par
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, team_handicap, gross_score, course_par } = await request.json();

    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (team_handicap !== undefined) updates.team_handicap = team_handicap;
    if (gross_score !== undefined) updates.gross_score = gross_score;
    if (course_par !== undefined) updates.course_par = course_par;

    const { error } = await adminClient
      .from("scramble_teams")
      .update(updates)
      .eq("id", team_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update scramble team error:", error);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

// DELETE - Delete a team (cascade deletes members)
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id } = await request.json();

    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("scramble_teams")
      .delete()
      .eq("id", team_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete scramble team error:", error);
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
