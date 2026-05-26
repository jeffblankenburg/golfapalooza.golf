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
  const [tripId, coursesRes, holesRes, roundsRes] = await Promise.all([
    getEffectiveTripId(),
    admin
      .from("courses")
      .select("id, name, club_name, city, state, locked, updated_at, updated_by")
      .order("name", { ascending: true }),
    admin
      .from("course_holes")
      .select("id, course_id, tee_id, hole_number, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude"),
    admin
      .from("rounds")
      .select("course_id, completed_at, round_date")
      .eq("status", "completed"),
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

  // Most-recent played round per course. Prefer completed_at; fall back to
  // round_date so historical imports (which lack a precise timestamp) still
  // surface.
  const lastPlayed = new Map<string, string>();
  for (const r of roundsRes.data || []) {
    const when = r.completed_at || r.round_date;
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
