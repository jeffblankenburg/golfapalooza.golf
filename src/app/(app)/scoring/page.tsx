import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, getEffectiveDate, isSimulating } from "@/lib/simulator";
import { LiveScorer } from "@/components/scoring/LiveScorer";

export default async function ScoringPage({ searchParams }: { searchParams: Promise<{ contest_id?: string }> }) {
  const resolvedParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const queryClient = simulating ? createAdminClient() : supabase;
  const adminClient = createAdminClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date, course_id")
    .eq("status", "active")
    .single();

  if (!trip) redirect("/");

  // Compute today's day number
  const today = await getEffectiveDate();
  const startDate = new Date(trip.start_date + "T00:00:00");
  const diffDays = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const todayDayNumber = diffDays + 1;

  // Find scramble contest — by contest_id param or fall back to today's day
  let contest: { id: string; scoring_closed_at: string | null; verified_at: string | null } | null = null;
  if (resolvedParams.contest_id) {
    const { data } = await queryClient
      .from("contests")
      .select("id, scoring_closed_at, verified_at")
      .eq("id", resolvedParams.contest_id)
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .maybeSingle();
    contest = data;
  } else {
    const { data } = await queryClient
      .from("contests")
      .select("id, scoring_closed_at, verified_at")
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .eq("day_number", todayDayNumber)
      .maybeSingle();
    contest = data;
  }

  if (!contest) redirect("/");

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

  if (!team) redirect("/");

  // Fetch team members, tee time, holes, scores, bonuses in parallel
  const [membersResult, teeTimeResult, teeAssignmentsResult] =
    await Promise.all([
      adminClient
        .from("scramble_team_members")
        .select("user_id, user:users(display_name, avatar_url)")
        .eq("team_id", team.id),
      adminClient
        .from("tee_times")
        .select("tee_time, starting_hole")
        .eq("scramble_team_id", team.id)
        .maybeSingle(),
      adminClient
        .from("contest_hole_tees")
        .select("hole_number, tee_id, handicap_index_override")
        .eq("contest_id", contest.id)
        .order("hole_number"),
    ]);

  const overridesActive =
    (teeAssignmentsResult.data?.length || 0) === 18 &&
    (teeAssignmentsResult.data || []).every(
      (ta) =>
        typeof (ta as { handicap_index_override?: number | null })
          .handicap_index_override === "number"
    );

  // Build hole data
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
    drive_latitude: number | null;
    drive_longitude: number | null;
    green_front_latitude: number | null;
    green_front_longitude: number | null;
    green_back_latitude: number | null;
    green_back_longitude: number | null;
  }[] = [];

  if (trip.course_id && teeAssignmentsResult.data?.length) {
    const [courseHolesResult, courseTeesResult] = await Promise.all([
      adminClient
        .from("course_holes")
        .select("tee_id, hole_number, par, yards, handicap_index, overhead_image_url, green_image_url, tee_latitude, tee_longitude, green_latitude, green_longitude, drive_latitude, drive_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude")
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
        drive_latitude: number | null;
        drive_longitude: number | null;
        green_front_latitude: number | null;
        green_front_longitude: number | null;
        green_back_latitude: number | null;
        green_back_longitude: number | null;
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
        drive_latitude: h.drive_latitude ?? null,
        drive_longitude: h.drive_longitude ?? null,
        green_front_latitude: h.green_front_latitude ?? null,
        green_front_longitude: h.green_front_longitude ?? null,
        green_back_latitude: h.green_back_latitude ?? null,
        green_back_longitude: h.green_back_longitude ?? null,
      });
    }

    // Build a fallback map: for each hole number, collect coords from any tee
    // (green location, drive zone, images are the same physical spots regardless of tee)
    const coordFallback = new Map<number, typeof holeMap extends Map<string, infer V> ? V : never>();
    for (const h of courseHolesResult.data || []) {
      const existing = coordFallback.get(h.hole_number);
      if (!existing) {
        coordFallback.set(h.hole_number, holeMap.get(`${h.tee_id}-${h.hole_number}`)!);
      } else {
        // Merge: fill in any nulls from this tee's data
        const src = holeMap.get(`${h.tee_id}-${h.hole_number}`)!;
        for (const key of [
          "tee_latitude", "tee_longitude", "green_latitude", "green_longitude",
          "drive_latitude", "drive_longitude", "green_front_latitude", "green_front_longitude",
          "green_back_latitude", "green_back_longitude", "overhead_image_url", "green_image_url",
        ] as const) {
          if (existing[key] === null && src[key] !== null) {
            (existing as Record<string, unknown>)[key] = src[key];
          }
        }
      }
    }

    holes = teeAssignmentsResult.data.map((ta) => {
      const data = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
      const fallback = coordFallback.get(ta.hole_number);
      const overrideValue = (
        ta as { handicap_index_override?: number | null }
      ).handicap_index_override;
      return {
        hole_number: ta.hole_number,
        par: data?.par || 4,
        handicap_index:
          overridesActive && typeof overrideValue === "number"
            ? overrideValue
            : (data?.handicap_index || 0),
        yards: data?.yards || 0,
        tee_color: teeColorMap.get(ta.tee_id) ?? null,
        overhead_image_url: data?.overhead_image_url ?? fallback?.overhead_image_url ?? null,
        green_image_url: data?.green_image_url ?? fallback?.green_image_url ?? null,
        tee_latitude: data?.tee_latitude ?? fallback?.tee_latitude ?? null,
        tee_longitude: data?.tee_longitude ?? fallback?.tee_longitude ?? null,
        green_latitude: data?.green_latitude ?? fallback?.green_latitude ?? null,
        green_longitude: data?.green_longitude ?? fallback?.green_longitude ?? null,
        drive_latitude: data?.drive_latitude ?? fallback?.drive_latitude ?? null,
        drive_longitude: data?.drive_longitude ?? fallback?.drive_longitude ?? null,
        green_front_latitude: data?.green_front_latitude ?? fallback?.green_front_latitude ?? null,
        green_front_longitude: data?.green_front_longitude ?? fallback?.green_front_longitude ?? null,
        green_back_latitude: data?.green_back_latitude ?? fallback?.green_back_latitude ?? null,
        green_back_longitude: data?.green_back_longitude ?? fallback?.green_back_longitude ?? null,
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

  const sortedHoles = holes.sort((a, b) => a.hole_number - b.hole_number);

  return (
    <LiveScorer
      team={{
        id: team.id,
        team_handicap: team.team_handicap,
        course_par: team.course_par,
        contest_id: team.contest_id,
        verified_at: team.verified_at,
      }}
      members={members}
      startingHole={teeTimeResult.data?.starting_hole || 1}
      holes={sortedHoles}
      initialScores={scoresResult.data || []}
      initialBonusPoints={bonusResult.data || []}
      currentUserId={effectiveUserId}
      scoringClosed={!!contest.scoring_closed_at}
      contestVerified={!!contest.verified_at}
    />
  );
}
