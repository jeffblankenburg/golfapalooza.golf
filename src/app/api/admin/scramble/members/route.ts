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

// POST - Add member(s) to a team (supports single user_id or batch user_ids)
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { team_id } = body;
    const userIds: string[] = body.user_ids || (body.user_id ? [body.user_id] : []);

    if (!team_id || userIds.length === 0) {
      return NextResponse.json(
        { error: "team_id and user_id(s) are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Look up this team's contest
    const { data: team } = await adminClient
      .from("scramble_teams")
      .select("contest_id")
      .eq("id", team_id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Check none of the users are already on another team in the same contest
    const { data: otherTeams } = await adminClient
      .from("scramble_teams")
      .select("id")
      .eq("contest_id", team.contest_id)
      .neq("id", team_id);

    if (otherTeams && otherTeams.length > 0) {
      const otherTeamIds = otherTeams.map((t) => t.id);
      const { data: existing } = await adminClient
        .from("scramble_team_members")
        .select("user_id")
        .in("team_id", otherTeamIds)
        .in("user_id", userIds);

      if (existing && existing.length > 0) {
        const taken = existing.map((e) => e.user_id);
        return NextResponse.json(
          { error: `Player(s) already on another team for this day`, taken },
          { status: 400 }
        );
      }
    }

    // Batch insert all members
    const rows = userIds.map((user_id) => ({ team_id, user_id }));
    const { error } = await adminClient
      .from("scramble_team_members")
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add scramble member error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// DELETE - Remove a member from a team
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, user_id } = await request.json();

    if (!team_id || !user_id) {
      return NextResponse.json(
        { error: "team_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("scramble_team_members")
      .delete()
      .eq("team_id", team_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove scramble member error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
