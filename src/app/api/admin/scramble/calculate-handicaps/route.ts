import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { calculateCourseHandicapRaw } from "@/lib/golf/calculator";

// Scramble handicap weights by team size (sorted best player first).
// Each set sums to ~50% of combined Course Handicaps.
const SCRAMBLE_WEIGHTS: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.25, 0.15, 0.10],
  4: [0.20, 0.15, 0.10, 0.05],
  5: [0.18, 0.14, 0.10, 0.05, 0.03],
};

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

interface TeeContext {
  source: "contest_tee" | "white_tee" | "hole_tee" | "trip_default";
  tee_name: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
}

interface MemberBreakdown {
  user_id: string;
  display_name: string;
  handicap_index: number | null;
  handicap_source: "event" | "live" | "missing";
  course_handicap: number;
  weight: number;
  contribution: number;
}

interface TeamBreakdown {
  team_id: string;
  team_handicap: number;
  member_count: number;
  members: MemberBreakdown[];
}

async function fetchTeeContext(
  admin: SupabaseAdmin,
  contestId: string,
  tripId: string
): Promise<TeeContext | null> {
  const { data: contestTee } = await admin
    .from("contest_tees")
    .select("tee:course_tees!inner(tee_name, course_rating, slope_rating, par)")
    .eq("contest_id", contestId)
    .maybeSingle();

  if (contestTee) {
    const t = Array.isArray(contestTee.tee) ? contestTee.tee[0] : contestTee.tee;
    return {
      source: "contest_tee",
      tee_name: t.tee_name ?? null,
      course_rating: t.course_rating,
      slope_rating: t.slope_rating,
      par: t.par,
    };
  }

  // Look up the trip's course once — used both to prefer the White tee (current
  // policy: scramble Course Handicaps come off the White tee) and as the final
  // default fallback. A mixed per-hole tee assignment has no single rating, so we
  // deliberately anchor the whole team to one tee rather than an arbitrary hole's.
  const { data: trip } = await admin
    .from("trip_settings")
    .select("course_id")
    .eq("id", tripId)
    .single();

  if (trip?.course_id) {
    const { data: whiteTee } = await admin
      .from("course_tees")
      .select("tee_name, course_rating, slope_rating, par")
      .eq("course_id", trip.course_id)
      .ilike("tee_name", "white")
      .maybeSingle();

    if (whiteTee) {
      return {
        source: "white_tee",
        tee_name: whiteTee.tee_name ?? null,
        course_rating: whiteTee.course_rating,
        slope_rating: whiteTee.slope_rating,
        par: whiteTee.par,
      };
    }
  }

  const { data: holeTee } = await admin
    .from("contest_hole_tees")
    .select("tee:course_tees!inner(tee_name, course_rating, slope_rating, par)")
    .eq("contest_id", contestId)
    .limit(1)
    .maybeSingle();

  if (holeTee) {
    const t = Array.isArray(holeTee.tee) ? holeTee.tee[0] : holeTee.tee;
    return {
      source: "hole_tee",
      tee_name: t.tee_name ?? null,
      course_rating: t.course_rating,
      slope_rating: t.slope_rating,
      par: t.par,
    };
  }

  if (trip?.course_id) {
    const { data: defaultTee } = await admin
      .from("course_tees")
      .select("tee_name, course_rating, slope_rating, par")
      .eq("course_id", trip.course_id)
      .order("slope_rating", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (defaultTee) {
      return {
        source: "trip_default",
        tee_name: defaultTee.tee_name ?? null,
        course_rating: defaultTee.course_rating,
        slope_rating: defaultTee.slope_rating,
        par: defaultTee.par,
      };
    }
  }

  return null;
}

async function buildBreakdown(
  admin: SupabaseAdmin,
  contestId: string
): Promise<{ tee: TeeContext; teams: TeamBreakdown[] } | { error: string; status: number }> {
  const { data: contest } = await admin
    .from("contests")
    .select("trip_id")
    .eq("id", contestId)
    .single();

  if (!contest) return { error: "Contest not found", status: 404 };

  const tee = await fetchTeeContext(admin, contestId, contest.trip_id);
  if (!tee) {
    return {
      error: "No course tee found. Assign a tee to the contest or set a course on the trip.",
      status: 400,
    };
  }

  const { data: teams, error: teamsError } = await admin
    .from("scramble_teams")
    .select("id, scramble_team_members(user_id, user:users(display_name))")
    .eq("contest_id", contestId);

  if (teamsError) {
    return { error: `Team fetch failed: ${teamsError.message}`, status: 500 };
  }
  if (!teams || teams.length === 0) {
    return { error: "No teams found", status: 400 };
  }

  // Normalize member rows — Supabase nests the joined user under the alias
  type MemberRow = { user_id: string; user: { display_name: string } | { display_name: string }[] | null };
  const teamMembers = teams.map((t) => ({
    id: t.id as string,
    members: ((t.scramble_team_members as MemberRow[]) || []).map((m) => ({
      user_id: m.user_id,
      display_name: Array.isArray(m.user) ? m.user[0]?.display_name : m.user?.display_name,
    })),
  }));

  const allPlayerIds = [...new Set(teamMembers.flatMap((t) => t.members.map((m) => m.user_id)))];

  // Prefer event-locked handicap, fall back to live; track which source
  const handicapMap = new Map<string, { hi: number; source: "event" | "live" }>();

  if (allPlayerIds.length > 0) {
    const { data: eventSnaps } = await admin
      .from("event_player_handicaps")
      .select("user_id, handicap_index")
      .eq("trip_id", contest.trip_id)
      .in("user_id", allPlayerIds);

    for (const s of eventSnaps || []) {
      if (s.handicap_index != null) handicapMap.set(s.user_id, { hi: s.handicap_index, source: "event" });
    }

    const missingIds = allPlayerIds.filter((id) => !handicapMap.has(id));
    if (missingIds.length > 0) {
      const { data: liveHandicaps } = await admin
        .from("player_handicaps")
        .select("user_id, handicap_index")
        .in("user_id", missingIds);
      for (const h of liveHandicaps || []) {
        if (h.handicap_index != null) handicapMap.set(h.user_id, { hi: h.handicap_index, source: "live" });
      }
    }
  }

  const breakdowns: TeamBreakdown[] = teamMembers.map((team) => {
    if (team.members.length === 0) {
      return { team_id: team.id, team_handicap: 0, member_count: 0, members: [] };
    }

    // Compute course handicap for each member, then sort lowest first to apply weights.
    const withCH = team.members.map((m) => {
      const entry = handicapMap.get(m.user_id);
      const hi = entry?.hi ?? 0;
      return {
        user_id: m.user_id,
        display_name: m.display_name ?? "Unknown",
        handicap_index: entry ? entry.hi : null,
        handicap_source: (entry?.source ?? "missing") as "event" | "live" | "missing",
        course_handicap: calculateCourseHandicapRaw(hi, tee.slope_rating, tee.course_rating, tee.par),
      };
    });

    withCH.sort((a, b) => a.course_handicap - b.course_handicap);

    const weights = SCRAMBLE_WEIGHTS[withCH.length] || SCRAMBLE_WEIGHTS[4];
    let teamHC = 0;
    const members: MemberBreakdown[] = withCH.map((m, i) => {
      const w = weights[i] ?? 0;
      const contribution = m.course_handicap * w;
      teamHC += contribution;
      return { ...m, weight: w, contribution };
    });

    return {
      team_id: team.id,
      team_handicap: Math.round(teamHC),
      member_count: members.length,
      members,
    };
  });

  return { tee, teams: breakdowns };
}

/**
 * @swagger
 * /api/admin/scramble/calculate-handicaps:
 *   get:
 *     summary: Preview team handicap calculation for a scramble contest
 *     description: |
 *       Returns the per-player breakdown that would be applied if Calculate Team
 *       Handicaps were run, without writing to the database. Used by the admin UI
 *       to show how each team's handicap was derived.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: contest_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Per-team breakdown with the tee context used
 *       400:
 *         description: Missing contest_id, no teams, or no tee available
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contest not found
 */
export async function GET(request: Request) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");
  if (!contestId) return NextResponse.json({ error: "contest_id is required" }, { status: 400 });

  const result = await buildBreakdown(createAdminClient(), contestId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ tee: result.tee, teams: result.teams });
}

/**
 * @swagger
 * /api/admin/scramble/calculate-handicaps:
 *   post:
 *     summary: Calculate and persist team handicaps for a scramble contest
 *     description: |
 *       Converts each team member's Handicap Index to a Course Handicap using the
 *       contest's tee, sorts lowest first, and applies weighted percentages by team
 *       size (e.g., 4-man = 20/15/10/5). Writes the rounded total to
 *       scramble_teams.team_handicap and returns the per-player breakdown.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Updated team handicaps with breakdown
 */
export async function POST(request: Request) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contest_id } = await request.json();
  if (!contest_id) return NextResponse.json({ error: "contest_id is required" }, { status: 400 });

  const admin = createAdminClient();
  const result = await buildBreakdown(admin, contest_id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  await Promise.all(
    result.teams.map((t) =>
      admin.from("scramble_teams").update({ team_handicap: t.team_handicap }).eq("id", t.team_id)
    )
  );

  return NextResponse.json({ success: true, tee: result.tee, teams: result.teams });
}
