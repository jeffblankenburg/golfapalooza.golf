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

// GET - Fetch all scoring data for a contest (teams, holes, scores, bonuses)
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
        "id, contest_id, team_handicap, gross_score, course_par, created_at, verified_at, verified_by, scramble_team_members(id, user_id, user:users(id, display_name, full_name, avatar_url))"
      )
      .eq("contest_id", contestId)
      .order("created_at");

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // Get contest trip_id
    const { data: contest } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Get trip course_id
    const { data: trip } = await adminClient
      .from("trip_settings")
      .select("course_id")
      .eq("id", contest.trip_id)
      .single();

    // Get tee assignments for this contest
    const { data: teeAssignments } = await adminClient
      .from("contest_hole_tees")
      .select("hole_number, tee_id")
      .eq("contest_id", contestId)
      .order("hole_number");

    // Build hole info from tee assignments + course_holes
    let holes: { hole_number: number; par: number; yards: number; handicap_index: number; tee_color: string | null }[] = [];

    if (trip?.course_id && teeAssignments && teeAssignments.length > 0) {
      const { data: courseHoles } = await adminClient
        .from("course_holes")
        .select("tee_id, hole_number, par, yards, handicap_index")
        .eq("course_id", trip.course_id);

      // Build tee_id -> tee_color lookup
      const { data: courseTees } = await adminClient
        .from("course_tees")
        .select("id, tee_color")
        .eq("course_id", trip.course_id);

      const teeColorMap = new Map<string, string | null>();
      for (const t of courseTees || []) {
        teeColorMap.set(t.id, t.tee_color);
      }

      if (courseHoles) {
        // Map: tee_id+hole_number -> hole data
        const holeMap = new Map<string, { par: number; yards: number; handicap_index: number }>();
        for (const h of courseHoles) {
          holeMap.set(`${h.tee_id}-${h.hole_number}`, {
            par: h.par,
            yards: h.yards || 0,
            handicap_index: h.handicap_index || 0,
          });
        }

        holes = teeAssignments.map((ta) => {
          const data = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
          return {
            hole_number: ta.hole_number,
            par: data?.par || 4,
            yards: data?.yards || 0,
            handicap_index: data?.handicap_index || 0,
            tee_color: teeColorMap.get(ta.tee_id) ?? null,
          };
        });
      }
    }

    // Fetch all hole scores for these teams
    const teamIds = (teams || []).map((t) => t.id);
    let scores: { team_id: string; hole_number: number; strokes: number }[] = [];
    if (teamIds.length > 0) {
      const { data: scoreData } = await adminClient
        .from("scramble_hole_scores")
        .select("team_id, hole_number, strokes")
        .in("team_id", teamIds);
      scores = scoreData || [];
    }

    // Fetch all bonus points
    let bonusPoints: { team_id: string; hole_number: number; user_id: string; on_green: boolean; holed_out: boolean }[] = [];
    if (teamIds.length > 0) {
      const { data: bonusData } = await adminClient
        .from("bspitw_bonus_points")
        .select("team_id, hole_number, user_id, on_green, holed_out")
        .in("team_id", teamIds);
      bonusPoints = bonusData || [];
    }

    // Look up verifier names
    const verifierIds = [...new Set((teams || []).map((t) => t.verified_by).filter(Boolean))];
    const verifierNames: Record<string, string> = {};
    if (verifierIds.length > 0) {
      const { data: verifiers } = await adminClient
        .from("users")
        .select("id, display_name")
        .in("id", verifierIds);
      for (const v of verifiers || []) {
        verifierNames[v.id] = v.display_name;
      }
    }

    // Normalize teams
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
        verified_at: team.verified_at || null,
        verified_by_name: team.verified_by ? (verifierNames[team.verified_by] || null) : null,
        members,
      };
    });

    return NextResponse.json({
      teams: normalizedTeams,
      holes,
      scores,
      bonus_points: bonusPoints,
    });
  } catch (error) {
    console.error("Get scramble scores error:", error);
    return NextResponse.json({ error: "Failed to load scoring data" }, { status: 500 });
  }
}

// DELETE - Clear scores (and bonus points) for a contest or all contests in a trip
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");
  const tripId = searchParams.get("trip_id");
  const mode = searchParams.get("mode"); // "today" or "all"

  if (!mode || (mode !== "today" && mode !== "all")) {
    return NextResponse.json({ error: "mode must be 'today' or 'all'" }, { status: 400 });
  }

  if (mode === "today" && !contestId) {
    return NextResponse.json({ error: "contest_id is required for mode=today" }, { status: 400 });
  }

  if (mode === "all" && !tripId) {
    return NextResponse.json({ error: "trip_id is required for mode=all" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Determine which contest IDs to clear
    let contestIds: string[] = [];

    if (mode === "today" && contestId) {
      contestIds = [contestId];
    } else if (mode === "all" && tripId) {
      const { data: contests } = await adminClient
        .from("contests")
        .select("id")
        .eq("trip_id", tripId)
        .eq("contest_type", "scramble");
      contestIds = (contests || []).map((c) => c.id);
    }

    if (contestIds.length === 0) {
      return NextResponse.json({ success: true, cleared: 0 });
    }

    // Get all team IDs for these contests
    const { data: teams } = await adminClient
      .from("scramble_teams")
      .select("id")
      .in("contest_id", contestIds);

    const teamIds = (teams || []).map((t) => t.id);

    if (teamIds.length === 0) {
      return NextResponse.json({ success: true, cleared: 0 });
    }

    // Delete hole scores
    const { error: scoresError } = await adminClient
      .from("scramble_hole_scores")
      .delete()
      .in("team_id", teamIds);

    if (scoresError) {
      return NextResponse.json({ error: scoresError.message }, { status: 500 });
    }

    // Delete bonus points
    const { error: bonusError } = await adminClient
      .from("bspitw_bonus_points")
      .delete()
      .in("team_id", teamIds);

    if (bonusError) {
      return NextResponse.json({ error: bonusError.message }, { status: 500 });
    }

    // Reset gross_score to null on all affected teams
    const { error: teamError } = await adminClient
      .from("scramble_teams")
      .update({ gross_score: null })
      .in("id", teamIds);

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cleared: teamIds.length });
  } catch (error) {
    console.error("Clear scramble scores error:", error);
    return NextResponse.json({ error: "Failed to clear scores" }, { status: 500 });
  }
}

// PUT - Batch upsert hole scores
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { scores } = await request.json();

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json({ error: "scores array is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Upsert scores
    const { error: upsertError } = await adminClient
      .from("scramble_hole_scores")
      .upsert(
        scores.map((s: { team_id: string; hole_number: number; strokes: number }) => ({
          team_id: s.team_id,
          hole_number: s.hole_number,
          strokes: s.strokes,
        })),
        { onConflict: "team_id,hole_number" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Recalculate gross_score for affected teams
    const affectedTeamIds = [...new Set(scores.map((s: { team_id: string }) => s.team_id))];

    for (const teamId of affectedTeamIds) {
      const { data: allScores } = await adminClient
        .from("scramble_hole_scores")
        .select("strokes")
        .eq("team_id", teamId);

      if (allScores && allScores.length === 18) {
        const grossScore = allScores.reduce((sum, s) => sum + s.strokes, 0);
        await adminClient
          .from("scramble_teams")
          .update({ gross_score: grossScore })
          .eq("id", teamId);
      } else {
        // Incomplete — set to null
        await adminClient
          .from("scramble_teams")
          .update({ gross_score: null })
          .eq("id", teamId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update scramble scores error:", error);
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
