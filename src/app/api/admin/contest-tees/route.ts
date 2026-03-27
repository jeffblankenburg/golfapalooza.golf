import { NextRequest, NextResponse } from "next/server";
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

/**
 * @swagger
 * /api/admin/contest-tees:
 *   get:
 *     summary: Get tee assignments for a contest
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: contest_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The contest ID
 *     responses:
 *       200:
 *         description: Contest tee assignments with available tees and hole data
 *       401:
 *         description: Unauthorized
 */
export async function GET(req: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contestId = req.nextUrl.searchParams.get("contest_id");
  if (!contestId) {
    return NextResponse.json(
      { error: "contest_id is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get contest with its trip
  const { data: contest, error: contestError } = await supabase
    .from("contests")
    .select("id, trip_id, name, contest_type")
    .eq("id", contestId)
    .single();

  if (contestError || !contest) {
    return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  }

  // Get trip's course_id
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, course_id")
    .eq("id", contest.trip_id)
    .single();

  if (!trip?.course_id) {
    return NextResponse.json({
      contest,
      assignments: [],
      tees: [],
      holes: [],
      error_message: "No course set for this trip",
    });
  }

  // Get available tees for this course
  const { data: tees } = await supabase
    .from("course_tees")
    .select("id, tee_name, tee_color, course_rating, slope_rating, par, total_yards")
    .eq("course_id", trip.course_id)
    .order("par", { ascending: false });

  if (!tees || tees.length === 0) {
    return NextResponse.json({
      contest,
      assignments: [],
      tees: [],
      holes: [],
      error_message: "No tee boxes defined for this course",
    });
  }

  // Get hole data for all tees
  const { data: holes } = await supabase
    .from("course_holes")
    .select("id, tee_id, hole_number, par, handicap_index, yards")
    .eq("course_id", trip.course_id)
    .order("hole_number");

  // Get current assignments
  const { data: assignments } = await supabase
    .from("contest_hole_tees")
    .select("id, hole_number, tee_id")
    .eq("contest_id", contestId)
    .order("hole_number");

  return NextResponse.json({
    contest,
    assignments: assignments || [],
    tees: tees || [],
    holes: holes || [],
  });
}

/**
 * @swagger
 * /api/admin/contest-tees:
 *   put:
 *     summary: Bulk save tee assignments for a contest
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   contest_id:
 *                     type: string
 *                   tee_id:
 *                     type: string
 *                 description: Single tee for all 18 holes (Ryder Cup)
 *               - type: object
 *                 properties:
 *                   contest_id:
 *                     type: string
 *                   assignments:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         hole_number:
 *                           type: integer
 *                         tee_id:
 *                           type: string
 *                 description: Per-hole tee assignments (Scramble)
 *     responses:
 *       200:
 *         description: Assignments saved
 *       401:
 *         description: Unauthorized
 */
export async function PUT(req: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contest_id, tee_id, assignments } = body;

  if (!contest_id) {
    return NextResponse.json(
      { error: "contest_id is required" },
      { status: 400 }
    );
  }

  if (!tee_id && !assignments) {
    return NextResponse.json(
      { error: "Either tee_id or assignments is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Build rows
  let rows: { contest_id: string; hole_number: number; tee_id: string }[];

  if (tee_id) {
    // Single tee for all 18 holes
    rows = Array.from({ length: 18 }, (_, i) => ({
      contest_id,
      hole_number: i + 1,
      tee_id,
    }));
  } else {
    // Per-hole assignments
    rows = assignments.map(
      (a: { hole_number: number; tee_id: string }) => ({
        contest_id,
        hole_number: a.hole_number,
        tee_id: a.tee_id,
      })
    );
  }

  // Delete existing assignments for this contest
  const { error: deleteError } = await supabase
    .from("contest_hole_tees")
    .delete()
    .eq("contest_id", contest_id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to clear existing assignments" },
      { status: 500 }
    );
  }

  // Insert new assignments
  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("contest_hole_tees")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save assignments", details: insertError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, count: rows.length });
}
