import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, getEffectiveDate, isSimulating, getEffectiveTripId } from "@/lib/simulator";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const simulating = await isSimulating(); 
    const effectiveUserId = await getEffectiveUserId(user.id);
    const queryClient = simulating ? createAdminClient() : supabase;

    // Get active trip
    const { data: trip } = await supabase
      .from("trip_settings")
      .select("id, start_date, course_id")
      .eq("id", (await getEffectiveTripId())!)
      .single();

    if (!trip) {
      return NextResponse.json({ error: "no_round_today" }, { status: 404 });
    }

    // Compute today's day number
    const today = await getEffectiveDate();
    const startDate = new Date(trip.start_date + "T00:00:00");
    const diffDays = Math.floor(
      (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const todayDayNumber = diffDays + 1;

    // Find scramble contest for today
    const { data: contest } = await queryClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .eq("day_number", todayDayNumber)
      .maybeSingle();

    if (!contest) {
      return NextResponse.json({ error: "no_round_today" }, { status: 404 });
    }

    // Find user's team for this contest (user may be on multiple scramble teams across days)
    const { data: memberships } = await queryClient
      .from("scramble_team_members")
      .select("team_id, team:scramble_teams(id, team_handicap, gross_score, course_par, contest_id, verified_at)")
      .eq("user_id", effectiveUserId);

    const team = (memberships || [])
      .map((m) => {
        const t = Array.isArray(m.team) ? m.team[0] : m.team;
        return t as { id: string; team_handicap: number; gross_score: number | null; course_par: number; contest_id: string; verified_at: string | null } | null;
      })
      .find((t) => t?.contest_id === contest.id);

    if (!team) {
      return NextResponse.json({ error: "no_round_today" }, { status: 404 });
    }

    // Fetch team members, tee time, holes, scores, bonuses in parallel
    const adminClient = createAdminClient();

    const [membersResult, teeTimeResult, teeAssignmentsResult] =
      await Promise.all([
        // Team members
        adminClient
          .from("scramble_team_members")
          .select(
            "user_id, user:users(display_name, avatar_url)"
          )
          .eq("team_id", team.id),
        // Tee time
        adminClient
          .from("tee_times")
          .select("tee_time, starting_hole")
          .eq("scramble_team_id", team.id)
          .maybeSingle(),
        // Hole tee assignments
        adminClient
          .from("contest_hole_tees")
          .select("hole_number, tee_id")
          .eq("contest_id", contest.id)
          .order("hole_number"),
      ]);

    // Build hole data from tee assignments
    let holes: {
      hole_number: number;
      par: number;
      handicap_index: number;
      yards: number;
      tee_color: string | null;
      overhead_image_url: string | null;
      green_image_url: string | null;
      tee_latitude: number | null;
      tee_longitude: number | null;
      green_latitude: number | null;
      green_longitude: number | null;
    }[] = [];

    if (trip.course_id && teeAssignmentsResult.data?.length) {
      const [courseHolesResult, courseTeesResult] = await Promise.all([
        adminClient
          .from("course_holes")
          .select(
            "tee_id, hole_number, par, yards, handicap_index, overhead_image_url, green_image_url, tee_latitude, tee_longitude, green_latitude, green_longitude"
          )
          .eq("course_id", trip.course_id),
        adminClient
          .from("course_tees")
          .select("id, tee_color")
          .eq("course_id", trip.course_id),
      ]);

      const teeColorMap = new Map<string, string | null>();
      for (const t of courseTeesResult.data || []) {
        teeColorMap.set(t.id, t.tee_color);
      }

      const holeMap = new Map<
        string,
        {
          par: number;
          yards: number;
          handicap_index: number;
          overhead_image_url: string | null;
          green_image_url: string | null;
          tee_latitude: number | null;
          tee_longitude: number | null;
          green_latitude: number | null;
          green_longitude: number | null;
        }
      >();
      for (const h of courseHolesResult.data || []) {
        holeMap.set(`${h.tee_id}-${h.hole_number}`, {
          par: h.par,
          yards: h.yards || 0,
          handicap_index: h.handicap_index || 0,
          overhead_image_url: h.overhead_image_url || null,
          green_image_url: h.green_image_url || null,
          tee_latitude: h.tee_latitude ?? null,
          tee_longitude: h.tee_longitude ?? null,
          green_latitude: h.green_latitude ?? null,
          green_longitude: h.green_longitude ?? null,
        });
      }

      holes = teeAssignmentsResult.data.map((ta) => {
        const data = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
        return {
          hole_number: ta.hole_number,
          par: data?.par || 4,
          handicap_index: data?.handicap_index || 0,
          yards: data?.yards || 0,
          tee_color: teeColorMap.get(ta.tee_id) ?? null,
          overhead_image_url: data?.overhead_image_url ?? null,
          green_image_url: data?.green_image_url ?? null,
          tee_latitude: data?.tee_latitude ?? null,
          tee_longitude: data?.tee_longitude ?? null,
          green_latitude: data?.green_latitude ?? null,
          green_longitude: data?.green_longitude ?? null,
        };
      });
    }

    // Fetch scores and bonuses
    const [scoresResult, bonusResult] = await Promise.all([
      adminClient
        .from("scramble_hole_scores")
        .select("hole_number, strokes")
        .eq("team_id", team.id),
      adminClient
        .from("bspitw_bonus_points")
        .select("hole_number, user_id, on_green, holed_out")
        .eq("team_id", team.id),
    ]);

    // Normalize members
    const members = (membersResult.data || []).map((m) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        user_id: m.user_id,
        display_name:
          (u as { display_name: string } | null)?.display_name || "Unknown",
        avatar_url:
          (u as { avatar_url: string | null } | null)?.avatar_url || null,
      };
    });

    return NextResponse.json({
      team: {
        id: team.id,
        team_handicap: team.team_handicap,
        course_par: team.course_par,
        contest_id: team.contest_id,
        verified_at: team.verified_at,
      },
      members,
      tee_time: teeTimeResult.data?.tee_time || null,
      starting_hole: teeTimeResult.data?.starting_hole || 1,
      holes: holes.sort((a, b) => a.hole_number - b.hole_number),
      scores: scoresResult.data || [],
      bonus_points: bonusResult.data || [],
    });
  } catch (error) {
    console.error("Get my round error:", error);
    return NextResponse.json(
      { error: "Failed to load round data" },
      { status: 500 }
    );
  }
}
