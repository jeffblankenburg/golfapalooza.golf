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

// POST - Add a member to a team
export async function POST(request: Request) {
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

    // Check team exists and get contest_id
    const { data: team } = await adminClient
      .from("cornhole_teams")
      .select("contest_id")
      .eq("id", team_id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Enforce max 2 members per team
    const { data: currentMembers } = await adminClient
      .from("cornhole_team_members")
      .select("id")
      .eq("team_id", team_id);

    if (currentMembers && currentMembers.length >= 2) {
      return NextResponse.json(
        { error: "Team already has 2 members" },
        { status: 400 }
      );
    }

    // Check user isn't already on another team in the same contest
    const { data: otherTeams } = await adminClient
      .from("cornhole_teams")
      .select("id")
      .eq("contest_id", team.contest_id)
      .neq("id", team_id);

    if (otherTeams && otherTeams.length > 0) {
      const otherTeamIds = otherTeams.map((t) => t.id);
      const { data: existing } = await adminClient
        .from("cornhole_team_members")
        .select("id")
        .in("team_id", otherTeamIds)
        .eq("user_id", user_id);

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Player is already on another team" },
          { status: 400 }
        );
      }
    }

    const { error } = await adminClient
      .from("cornhole_team_members")
      .insert({ team_id, user_id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add cornhole member error:", error);
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
      .from("cornhole_team_members")
      .delete()
      .eq("team_id", team_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove cornhole member error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
