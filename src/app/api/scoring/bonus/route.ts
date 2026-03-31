import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, hole_number, user_id, on_green, holed_out } =
      await request.json();

    if (!team_id || !hole_number || !user_id) {
      return NextResponse.json(
        { error: "team_id, hole_number, and user_id are required" },
        { status: 400 }
      );
    }

    // Players can only set their own bonuses
    if (user_id !== user.id) {
      return NextResponse.json(
        { error: "Can only set your own bonuses" },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Verify user is a team member and team is not verified
    const { data: membership } = await adminClient
      .from("scramble_team_members")
      .select("id, team:scramble_teams(verified_at)")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this team" },
        { status: 403 }
      );
    }

    const teamData = Array.isArray(membership.team)
      ? membership.team[0]
      : membership.team;
    if (teamData?.verified_at) {
      return NextResponse.json(
        { error: "Scorecard is verified and locked" },
        { status: 403 }
      );
    }

    // Check if scoring is closed for this contest
    const { data: teamContest } = await adminClient
      .from("scramble_teams")
      .select("contest:contests(scoring_closed_at)")
      .eq("id", team_id)
      .single();

    const contestData = teamContest?.contest
      ? (Array.isArray(teamContest.contest) ? teamContest.contest[0] : teamContest.contest)
      : null;
    if (contestData?.scoring_closed_at) {
      return NextResponse.json(
        { error: "Scoring is closed" },
        { status: 403 }
      );
    }

    // If holed_out is true, clear holed_out on other players for this team+hole
    if (holed_out) {
      await adminClient
        .from("bspitw_bonus_points")
        .update({ holed_out: false })
        .eq("team_id", team_id)
        .eq("hole_number", hole_number)
        .neq("user_id", user_id);
    }

    // Upsert via authenticated client (RLS applies)
    const { error: upsertError } = await supabase
      .from("bspitw_bonus_points")
      .upsert(
        {
          team_id,
          hole_number,
          user_id,
          on_green: on_green ?? false,
          holed_out: holed_out ?? false,
        },
        { onConflict: "team_id,hole_number,user_id" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save bonus points error:", error);
    return NextResponse.json(
      { error: "Failed to save bonus" },
      { status: 500 }
    );
  }
}
