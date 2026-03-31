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
    const { team_id, hole_number, strokes } = await request.json();

    if (!team_id || !hole_number || strokes == null) {
      return NextResponse.json(
        { error: "team_id, hole_number, and strokes are required" },
        { status: 400 }
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

    // Upsert score via authenticated client (RLS applies)
    const { error: upsertError } = await supabase
      .from("scramble_hole_scores")
      .upsert(
        { team_id, hole_number, strokes },
        { onConflict: "team_id,hole_number" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    // Recalculate gross_score via admin client
    const { data: allScores } = await adminClient
      .from("scramble_hole_scores")
      .select("strokes")
      .eq("team_id", team_id);

    if (allScores && allScores.length === 18) {
      const grossScore = allScores.reduce((sum, s) => sum + s.strokes, 0);
      await adminClient
        .from("scramble_teams")
        .update({ gross_score: grossScore })
        .eq("id", team_id);
    } else {
      await adminClient
        .from("scramble_teams")
        .update({ gross_score: null })
        .eq("id", team_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save hole score error:", error);
    return NextResponse.json(
      { error: "Failed to save score" },
      { status: 500 }
    );
  }
}
