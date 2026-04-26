import { NextResponse } from "next/server";
import { checkIsAdmin } from "@/lib/permissions-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/admin/courses/unverified:
 *   get:
 *     summary: List courses awaiting admin verification
 *     description: Returns courses that came in via the AI/GCAPI cascade and haven't been spot-checked yet.
 *     tags: [Admin]
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, name, club_name, city, state, hole_count, source, created_at")
    .eq("verified", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull tee summaries in one round-trip rather than N+1.
  const ids = (courses || []).map((c) => c.id);
  const teeSummaries: Record<string, { count: number; back_par: number | null; back_rating: number | null; back_slope: number | null }> = {};
  if (ids.length > 0) {
    const { data: tees } = await supabase
      .from("course_tees")
      .select("course_id, par, course_rating, slope_rating")
      .in("course_id", ids);
    for (const t of tees || []) {
      const cur = teeSummaries[t.course_id] ||= { count: 0, back_par: null, back_rating: null, back_slope: null };
      cur.count++;
      if (t.course_rating != null && (cur.back_rating == null || t.course_rating > cur.back_rating)) {
        cur.back_par = t.par;
        cur.back_rating = t.course_rating;
        cur.back_slope = t.slope_rating;
      }
    }
  }

  return NextResponse.json({
    courses: (courses || []).map((c) => ({ ...c, tee_summary: teeSummaries[c.id] || null })),
  });
}
