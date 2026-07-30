import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId } from "@/lib/simulator";
import { summarizeCourse, type HoleCoordRow } from "@/lib/courses/mapped-status";

/**
 * Issue #133. Powers the `/courses` page. Returns every course (so a Loozer
 * can browse the whole library), plus computed mapped-status, last-played
 * timestamp, and which course is the active event's course (for the
 * featured card up top).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // PostgREST silently caps each SELECT at 1000 rows. With ~250 courses × 18
  // holes × N tees, course_holes is already past 4500 and growing — without
  // paging, courses that aren't in the first 1000-row window show as 0/0
  // "Not mapped" even when their data is complete. Same trap that bit
  // song_plays in migration 00155.
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

  const [tripId, coursesRes, holesRes, roundsRes] = await Promise.all([
    getEffectiveTripId(),
    admin
      .from("courses")
      .select("id, name, club_name, city, state, locked, updated_at, updated_by")
      .order("name", { ascending: true }),
    fetchAll<HoleCoordRow & { course_id: string }>(async (f, t) => {
      const r = await admin
        .from("course_holes")
        .select("id, course_id, tee_id, hole_number, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude")
        .range(f, t);
      return { data: r.data as Array<HoleCoordRow & { course_id: string }> | null, error: r.error };
    }),
    fetchAll<{ course_id: string; completed_at: string | null; round_date: string | null }>(async (f, t) => {
      const r = await admin
        .from("rounds")
        .select("course_id, completed_at, round_date")
        .eq("status", "completed")
        .range(f, t);
      return { data: r.data, error: r.error };
    }),
  ]);

  if (coursesRes.error) {
    return NextResponse.json({ error: coursesRes.error.message }, { status: 500 });
  }

  // Resolve active event course id (sim-aware).
  let activeEventCourseId: string | null = null;
  if (tripId) {
    const { data: trip } = await admin
      .from("trip_settings")
      .select("course_id")
      .eq("id", tripId)
      .maybeSingle();
    activeEventCourseId = trip?.course_id || null;
  }

  // Group holes by course for the mapped-status calc.
  const holesByCourse = new Map<string, HoleCoordRow[]>();
  for (const h of (holesRes.data || []) as Array<HoleCoordRow & { course_id: string }>) {
    const arr = holesByCourse.get(h.course_id) || [];
    arr.push(h);
    holesByCourse.set(h.course_id, arr);
  }

  // Most-recent played round per course, keyed off round_date (the calendar
  // date the round was played) — not completed_at, which for a backfilled
  // historical round is "today" and would wrongly float old courses to the top
  // (issue #143). round_date is NOT NULL, so every round contributes and all
  // comparisons stay date-only.
  const lastPlayed = new Map<string, string>();
  for (const r of roundsRes.data || []) {
    const when = r.round_date;
    if (!when || !r.course_id) continue;
    const prev = lastPlayed.get(r.course_id);
    if (!prev || when > prev) lastPlayed.set(r.course_id, when);
  }

  const courses = (coursesRes.data || []).map((c) => {
    const holes = holesByCourse.get(c.id) || [];
    const summary = summarizeCourse(holes);
    return {
      id: c.id,
      name: c.name,
      club_name: c.club_name,
      city: c.city,
      state: c.state,
      locked: c.locked,
      updated_at: c.updated_at,
      last_played_at: lastPlayed.get(c.id) || null,
      mapped: {
        set_points: summary.setPoints,
        total_points: summary.totalPoints,
        fully_mapped_holes: summary.fullyMappedHoles,
        total_holes: summary.totalHoles,
      },
    };
  });

  // Sort: last-played desc (rounds in the system), then alpha by name.
  courses.sort((a, b) => {
    if (a.last_played_at && b.last_played_at) {
      if (a.last_played_at > b.last_played_at) return -1;
      if (a.last_played_at < b.last_played_at) return 1;
    } else if (a.last_played_at) {
      return -1;
    } else if (b.last_played_at) {
      return 1;
    }
    return (a.name || "").localeCompare(b.name || "");
  });

  return NextResponse.json({
    active_event_course_id: activeEventCourseId,
    courses,
  });
}
