// Persists a NormalizedScorecard to the courses / course_tees / course_holes
// tables. Used by both the GCAPI and AI branches of the lookup cascade.
//
// Always uses the admin (service-role) client so we can set source/verified
// regardless of who triggered the lookup, and so RLS doesn't get in the way
// of cross-user upserts on lookup_key.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLookupKey, type NormalizedScorecard } from "./scorecard";

export interface PersistResult {
  course_id: string;
  tee_count: number;
  hole_count: number;
  reused: boolean;          // true if a row already existed at this lookup_key
}

export async function persistScorecard(
  admin: SupabaseClient,
  payload: NormalizedScorecard
): Promise<PersistResult> {
  const lookupKey = buildLookupKey(
    payload.course.name,
    payload.course.state || "",
    payload.course.city
  );

  // 1. Reuse if a row already exists at this lookup_key.
  const { data: existing } = await admin
    .from("courses")
    .select("id")
    .eq("lookup_key", lookupKey)
    .maybeSingle();

  if (existing) {
    return { course_id: existing.id, tee_count: 0, hole_count: 0, reused: true };
  }

  // 2. Insert the course shell.
  const { data: course, error: courseErr } = await admin
    .from("courses")
    .insert({
      name: payload.course.name,
      club_name: payload.course.club_name,
      city: payload.course.city,
      state: payload.course.state,
      address: payload.course.address,
      website: payload.course.website,
      latitude: payload.course.latitude,
      longitude: payload.course.longitude,
      hole_count: payload.hole_count,
      external_id: payload.external_id,
      source: payload.source,
      verified: false,
      lookup_key: lookupKey,
    })
    .select("id")
    .single();

  if (courseErr || !course) {
    // Likely a unique-constraint race on lookup_key — re-read and reuse.
    const { data: raced } = await admin
      .from("courses")
      .select("id")
      .eq("lookup_key", lookupKey)
      .maybeSingle();
    if (raced) {
      return { course_id: raced.id, tee_count: 0, hole_count: 0, reused: true };
    }
    throw new Error(courseErr?.message || "course insert failed");
  }

  // From here on, any failure rolls back the course row (cascade kills tees +
  // holes). Without this, a half-inserted course sticks around and the next
  // commit short-circuits on lookup_key, returning an empty/broken course.
  const rollback = async (reason: Error): Promise<never> => {
    await admin.from("courses").delete().eq("id", course.id);
    throw new Error(`${reason.message} (rolled back course ${course.id})`);
  };

  // 3. Disambiguate tee names — AI sometimes returns multiple tees with the
  //    same display name (e.g. men's and women's "White"). The course_tees
  //    UNIQUE(course_id, tee_name) constraint rejects the second one, so
  //    suffix the gender on collisions before insert.
  const seen = new Map<string, number>();
  const dedupedTees = payload.tees.map((t) => {
    const baseName = t.tee_name.trim();
    const count = seen.get(baseName.toLowerCase()) || 0;
    seen.set(baseName.toLowerCase(), count + 1);
    if (count === 0) return t;
    const suffix = t.gender !== "all" ? ` (${t.gender})` : ` ${count + 1}`;
    return { ...t, tee_name: `${baseName}${suffix}` };
  });

  // 4. Batch insert tees. Postgres INSERT ... RETURNING preserves input order,
  //    so we match by index — this avoids any edge case where two tees ended
  //    up with the same name and a name-based join misrouted holes.
  const teeRows = dedupedTees.map((t) => ({
    course_id: course.id,
    tee_name: t.tee_name,
    tee_color: t.tee_color,
    gender: t.gender,
    course_rating: t.course_rating,
    slope_rating: t.slope_rating,
    total_yards: t.total_yards,
    par: t.par,
  }));
  const { data: teesInserted, error: teeErr } = await admin
    .from("course_tees")
    .insert(teeRows)
    .select("id");

  if (teeErr || !teesInserted || teesInserted.length !== dedupedTees.length) {
    await rollback(new Error(
      teeErr?.message || `tee insert returned ${teesInserted?.length ?? 0}/${dedupedTees.length} rows`
    ));
  }
  const teeIds = teesInserted!.map((t) => t.id);

  // 5. Build hole rows, deduping any (tee_id, hole_number) collision within a
  //    single tee defensively — the validator should already prevent this,
  //    but the unique constraint takes the whole insert down if anything slips
  //    through, so silently dropping duplicates is safer than a 500.
  const holeRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < dedupedTees.length; i++) {
    const tee = dedupedTees[i];
    const teeId = teeIds[i];
    const seenHoles = new Set<number>();
    for (const h of tee.holes) {
      if (seenHoles.has(h.hole_number)) continue;
      seenHoles.add(h.hole_number);
      holeRows.push({
        course_id: course.id,
        tee_id: teeId,
        hole_number: h.hole_number,
        hole_name: h.hole_name,
        par: h.par,
        handicap_index: h.handicap_index,
        yards: h.yards,
      });
    }
  }

  if (holeRows.length > 0) {
    const { error: holeErr } = await admin.from("course_holes").insert(holeRows);
    if (holeErr) {
      await rollback(new Error(
        `holes insert failed (${holeRows.length} rows for course ${course.id}): ${holeErr.message}`
      ));
    }
  }

  return {
    course_id: course.id,
    tee_count: teeIds.length,
    hole_count: holeRows.length,
    reused: false,
  };
}
