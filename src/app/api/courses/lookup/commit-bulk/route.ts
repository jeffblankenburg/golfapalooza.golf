import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistScorecard } from "@/lib/courses/persist";
import type { NormalizedScorecard } from "@/lib/courses/scorecard";

interface DraftPayload {
  lookup_key: string;
  confidence: "high" | "medium" | "low";
  source: "gcapi" | "ai";
  course: NormalizedScorecard["course"];
  hole_count: 9 | 18;
  tees: NormalizedScorecard["tees"];
  source_urls: string[];
  notes: string | null;
  external_id: string | null;
}

interface BulkBody {
  generationId?: string | null;
  drafts: DraftPayload[];
}

/**
 * @swagger
 * /api/courses/lookup/commit-bulk:
 *   post:
 *     summary: Persist multiple confirmed drafts in one call
 *     description: |
 *       Used when a user finds a multi-course club via /api/courses/lookup
 *       and chooses "Import all" rather than confirming each in turn.
 *       Each draft is persisted independently — partial success is fine —
 *       and the caller gets back the full list of committed rows plus any
 *       per-draft errors.
 *     tags: [Courses]
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: BulkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const drafts = Array.isArray(body.drafts) ? body.drafts : [];
  if (drafts.length === 0) {
    return NextResponse.json({ error: "drafts array is required" }, { status: 400 });
  }
  if (drafts.length > 25) {
    return NextResponse.json({ error: "Too many drafts in one request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const courses: unknown[] = [];
  const errors: { index: number; error: string }[] = [];

  // Sequential rather than parallel: persistScorecard does multi-step
  // inserts with rollback, and a parallel storm against the same table is
  // more likely to hit unique-constraint races. ~100ms per course is fine.
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (!d || !Array.isArray(d.tees) || d.tees.length === 0) {
      errors.push({ index: i, error: "Draft missing tees" });
      continue;
    }
    const normalized: NormalizedScorecard = {
      source: d.source,
      confidence: d.confidence,
      external_id: d.external_id,
      course: d.course,
      hole_count: d.hole_count,
      tees: d.tees,
      source_urls: d.source_urls,
      notes: d.notes,
    };
    try {
      const result = await persistScorecard(admin, normalized);
      const { data: course } = await admin
        .from("courses")
        .select("id, name, club_name, city, state, hole_count, source, verified")
        .eq("id", result.course_id)
        .single();
      if (course) courses.push(course);
    } catch (e) {
      errors.push({ index: i, error: (e as Error).message });
    }
  }

  if (body.generationId && courses.length > 0) {
    const firstId = (courses[0] as { id: string }).id;
    await admin
      .from("ai_generations")
      .update({ committed: true, committed_resource_id: firstId })
      .eq("id", body.generationId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ courses, errors });
}
