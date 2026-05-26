import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkCourseEditAccess, stampCourseEdit } from "@/lib/courses/edit-access";

/**
 * Issue #133. Per-hole data editor — any signed-in Loozer can edit holes on
 * an unlocked course; admins can edit holes on any course. Mirrors the
 * tee-specific vs. shared-across-tees behavior of the old admin endpoint
 * (par/handicap_index/yards are tee-specific; hole_name is shared).
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  let body: { holes?: Array<{ id: string; par?: number; handicap_index?: number; yards?: number; hole_name?: string | null }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { holes } = body;
  if (!holes || !Array.isArray(holes) || holes.length === 0) {
    return NextResponse.json({ error: "holes array is required" }, { status: 400 });
  }

  const incoming = holes.filter((h) => h && h.id);
  if (incoming.length === 0) {
    return NextResponse.json({ error: "no valid holes" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the course id from the holes themselves so the caller doesn't
  // have to send it (and can't lie about it). All holes in one PUT must
  // belong to the same course.
  const ids = incoming.map((h) => h.id);
  const { data: rows, error: lookupErr } = await admin
    .from("course_holes")
    .select("id, course_id, hole_number")
    .in("id", ids);
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  const courseIds = new Set((rows || []).map((r) => r.course_id));
  if (courseIds.size !== 1) {
    return NextResponse.json({ error: "all holes must belong to the same course" }, { status: 400 });
  }
  const courseId = [...courseIds][0];

  const access = await checkCourseEditAccess(courseId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  // Per-id updates for tee-specific fields. Only update fields that were
  // explicitly sent — callers are free to push just hole_name (e.g. the
  // drawer-driven name editor) without clobbering the rest.
  const teeFieldUpdates = await Promise.all(
    incoming.map((hole) => {
      const updates: Record<string, number> = {};
      if (typeof hole.par === "number") updates.par = hole.par;
      if (typeof hole.handicap_index === "number") updates.handicap_index = hole.handicap_index;
      if (typeof hole.yards === "number") updates.yards = hole.yards;
      if (Object.keys(updates).length === 0) return Promise.resolve({ error: null });
      return admin.from("course_holes").update(updates).eq("id", hole.id);
    }),
  );
  const teeFail = teeFieldUpdates.find((r) => r.error);
  if (teeFail?.error) {
    return NextResponse.json({ error: teeFail.error.message }, { status: 500 });
  }

  // Mirror hole_name across every tee row for the same (course_id, hole_number).
  const seen = new Set<string>();
  const nameUpdates: PromiseLike<{ error: { message: string } | null }>[] = [];
  for (const hole of incoming) {
    if (!Object.prototype.hasOwnProperty.call(hole, "hole_name")) continue;
    const row = byId.get(hole.id);
    if (!row) continue;
    const key = `${row.course_id}|${row.hole_number}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const trimmed = typeof hole.hole_name === "string" ? hole.hole_name.trim() : "";
    const value = trimmed.length > 0 ? trimmed : null;

    nameUpdates.push(
      admin
        .from("course_holes")
        .update({ hole_name: value })
        .eq("course_id", row.course_id)
        .eq("hole_number", row.hole_number),
    );
  }
  const nameResults = await Promise.all(nameUpdates);
  const nameFail = nameResults.find((r) => r.error);
  if (nameFail?.error) {
    return NextResponse.json({ error: nameFail.error.message }, { status: 500 });
  }

  await stampCourseEdit(courseId, effectiveUserId);
  return NextResponse.json({ success: true });
}
