import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

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
      .from("cornhole_teams")
      .select(
        "id, contest_id, created_at, cornhole_team_members(id, user_id, user:users(id, display_name, full_name, avatar_url))"
      )
      .eq("contest_id", contestId)
      .order("created_at");

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // Fetch all contest participants (the pool of available players)
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select("user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
      .eq("contest_id", contestId);

    // Build set of assigned user IDs
    const assignedIds = new Set<string>();
    for (const team of teams || []) {
      for (const member of (team as Record<string, unknown>).cornhole_team_members as Array<{ user_id: string }>) {
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

    // Normalize team members
    const normalizedTeams = (teams || []).map((team) => {
      const members = ((team as Record<string, unknown>).cornhole_team_members as Array<{
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
        members,
      };
    });

    return NextResponse.json({ teams: normalizedTeams, unassigned });
  } catch (error) {
    console.error("Get cornhole teams error:", error);
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
    const { contest_id } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: team, error } = await adminClient
      .from("cornhole_teams")
      .insert({ contest_id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Create cornhole team error:", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

// DELETE - Delete a single team or all teams for a contest
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bulk reset: DELETE /api/admin/cornhole?contest_id=...
  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (contestId) {
    const adminClient = createAdminClient();

    // Get team IDs before deleting, to clear bracket references
    const { data: teamsToDelete } = await adminClient
      .from("cornhole_teams")
      .select("id")
      .eq("contest_id", contestId);

    if (teamsToDelete && teamsToDelete.length > 0) {
      const teamIds = teamsToDelete.map((t) => t.id);
      // Clear bracket slots that reference these teams
      for (const tid of teamIds) {
        await adminClient
          .from("cornhole_bracket_matches")
          .update({ slot1_participant_id: null })
          .eq("contest_id", contestId)
          .eq("slot1_participant_id", tid);
        await adminClient
          .from("cornhole_bracket_matches")
          .update({ slot2_participant_id: null })
          .eq("contest_id", contestId)
          .eq("slot2_participant_id", tid);
        await adminClient
          .from("cornhole_bracket_matches")
          .update({ winner_participant_id: null })
          .eq("contest_id", contestId)
          .eq("winner_participant_id", tid);
      }
    }

    const { error } = await adminClient
      .from("cornhole_teams")
      .delete()
      .eq("contest_id", contestId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Single team delete: body { team_id }
  try {
    const { team_id } = await request.json();

    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the team's contest_id to find bracket matches
    const { data: team } = await adminClient
      .from("cornhole_teams")
      .select("contest_id")
      .eq("id", team_id)
      .single();

    if (team) {
      // Clear bracket slots that reference this team
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ slot1_participant_id: null })
        .eq("contest_id", team.contest_id)
        .eq("slot1_participant_id", team_id);
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ slot2_participant_id: null })
        .eq("contest_id", team.contest_id)
        .eq("slot2_participant_id", team_id);
      await adminClient
        .from("cornhole_bracket_matches")
        .update({ winner_participant_id: null })
        .eq("contest_id", team.contest_id)
        .eq("winner_participant_id", team_id);
    }

    const { error } = await adminClient
      .from("cornhole_teams")
      .delete()
      .eq("id", team_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete cornhole team error:", error);
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
