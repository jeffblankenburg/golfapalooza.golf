import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { summarizeCourse, type HoleCoordRow } from "@/lib/v2/courses/mapped-status";

/**
 * Powers the v2 `/courses` page. Returns the whole universal library plus each
 * course's computed GPS mapped-status. No org scoping, no locking, no
 * active-event featuring (courses aren't event-bound in v2). Any signed-in user
 * may read.
 */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();

  // PostGREST caps each SELECT at 1000 rows; the holes table is far larger than
  // that across the whole library, so page through it (same trap as elsewhere).
  async function fetchAll<T>(
    runPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
    pageSize = 1000,
  ): Promise<{ data: T[]; error: { message: string } | null }> {
    const out: T[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await runPage(from, from + pageSize - 1);
      if (error) return { data: out, error };
      const page = data || [];
      out.push(...page);
      if (page.length < pageSize) return { data: out, error: null };
      from += pageSize;
    }
  }

  const [coursesRes, holesRes] = await Promise.all([
    admin
      .from("v2_courses")
      .select("id, name, club_name, city, state, updated_at")
      .order("name", { ascending: true }),
    fetchAll<HoleCoordRow & { course_id: string }>(async (f, t) => {
      const r = await admin
        .from("v2_course_holes")
        .select("id, course_id, tee_id, hole_number, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude")
        .range(f, t);
      return { data: r.data as Array<HoleCoordRow & { course_id: string }> | null, error: r.error };
    }),
  ]);

  if (coursesRes.error) {
    return NextResponse.json({ error: coursesRes.error.message }, { status: 500 });
  }

  const holesByCourse = new Map<string, HoleCoordRow[]>();
  for (const h of (holesRes.data || []) as Array<HoleCoordRow & { course_id: string }>) {
    const arr = holesByCourse.get(h.course_id) || [];
    arr.push(h);
    holesByCourse.set(h.course_id, arr);
  }

  const courses = (coursesRes.data || []).map((c) => {
    const summary = summarizeCourse(holesByCourse.get(c.id) || []);
    return {
      id: c.id,
      name: c.name,
      club_name: c.club_name,
      city: c.city,
      state: c.state,
      locked: false, // v2 has no per-course locking; kept for UI shape parity
      updated_at: c.updated_at,
      last_played_at: null,
      mapped: {
        set_points: summary.setPoints,
        total_points: summary.totalPoints,
        fully_mapped_holes: summary.fullyMappedHoles,
        total_holes: summary.totalHoles,
      },
    };
  });

  // v2 has no rounds/active-event course yet — alpha order, no featured card.
  return NextResponse.json({ active_event_course_id: null, courses });
}
