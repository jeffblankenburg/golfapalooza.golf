import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistScorecard } from "@/lib/courses/persist";
import type { NormalizedScorecard } from "@/lib/courses/scorecard";

interface CommitBody {
  generationId?: string | null;       // present for AI commits, null for GCAPI
  draft: {
    lookup_key: string;
    confidence: "high" | "medium" | "low";
    source: "gcapi" | "ai";
    course: NormalizedScorecard["course"];
    hole_count: 9 | 18;
    tees: NormalizedScorecard["tees"];
    source_urls: string[];
    notes: string | null;
    external_id: string | null;
  };
}

/**
 * @swagger
 * /api/courses/lookup/commit:
 *   post:
 *     summary: Persist a confirmed lookup draft as a real course
 *     description: |
 *       Called after the user reviews and approves a draft returned by
 *       /api/courses/lookup. Inserts the course / tees / holes, marks
 *       the matching ai_generations row as committed, and returns the
 *       new course id so the round-creation flow can proceed.
 *     tags: [Courses, AI]
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CommitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { draft, generationId } = body;
  if (!draft || !Array.isArray(draft.tees) || draft.tees.length === 0) {
    return NextResponse.json({ error: "Draft missing tees" }, { status: 400 });
  }

  const admin = createAdminClient();

  const normalized: NormalizedScorecard = {
    source: draft.source,
    confidence: draft.confidence,
    external_id: draft.external_id,
    course: draft.course,
    hole_count: draft.hole_count,
    tees: draft.tees,
    source_urls: draft.source_urls,
    notes: draft.notes,
  };

  let result;
  try {
    result = await persistScorecard(admin, normalized);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Mark the originating AI call as committed (for accept-rate dashboards).
  if (generationId) {
    await admin
      .from("ai_generations")
      .update({ committed: true, committed_resource_id: result.course_id })
      .eq("id", generationId)
      .eq("user_id", user.id);
  }

  const { data: course } = await admin
    .from("courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("id", result.course_id)
    .single();

  return NextResponse.json({
    course,
    tee_count: result.tee_count,
    hole_count: result.hole_count,
    reused: result.reused,
  });
}
