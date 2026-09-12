import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * Per-hole data editor. par/handicap_index/yards are tee-specific; hole_name is
 * mirrored across every tee on the same (course, hole). Universal edit.
 */
export async function PUT(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { holes?: Array<{ id: string; par?: number; handicap_index?: number; yards?: number; hole_name?: string | null }> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { holes } = body;
  if (!holes || !Array.isArray(holes) || holes.length === 0) {
    return NextResponse.json({ error: "holes array is required" }, { status: 400 });
  }
  const incoming = holes.filter((h) => h && h.id);
  if (incoming.length === 0) return NextResponse.json({ error: "no valid holes" }, { status: 400 });

  const admin = v2AdminClient();
  const ids = incoming.map((h) => h.id);
  const { data: rows, error: lookupErr } = await admin
    .from("v2_course_holes")
    .select("id, course_id, hole_number")
    .in("id", ids);
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });

  const byId = new Map((rows || []).map((r) => [r.id, r]));
  const courseIds = new Set((rows || []).map((r) => r.course_id));
  if (courseIds.size !== 1) return NextResponse.json({ error: "all holes must belong to the same course" }, { status: 400 });
  const courseId = [...courseIds][0];

  const teeFieldUpdates = await Promise.all(
    incoming.map((hole) => {
      const updates: Record<string, number> = {};
      if (typeof hole.par === "number") updates.par = hole.par;
      if (typeof hole.handicap_index === "number") updates.handicap_index = hole.handicap_index;
      if (typeof hole.yards === "number") updates.yards = hole.yards;
      if (Object.keys(updates).length === 0) return Promise.resolve({ error: null });
      return admin.from("v2_course_holes").update(updates).eq("id", hole.id);
    }),
  );
  const teeFail = teeFieldUpdates.find((r) => r.error);
  if (teeFail?.error) return NextResponse.json({ error: teeFail.error.message }, { status: 500 });

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
      admin.from("v2_course_holes").update({ hole_name: value }).eq("course_id", row.course_id).eq("hole_number", row.hole_number),
    );
  }
  const nameResults = await Promise.all(nameUpdates);
  const nameFail = nameResults.find((r) => r.error);
  if (nameFail?.error) return NextResponse.json({ error: nameFail.error.message }, { status: 500 });

  await admin.from("v2_courses").update({ updated_at: new Date().toISOString(), updated_by: userId }).eq("id", courseId);
  return NextResponse.json({ success: true });
}
