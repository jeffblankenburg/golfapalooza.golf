import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { persistScorecard } from "@/lib/v2/courses/persist";
import type { NormalizedScorecard } from "@/lib/v2/courses/scorecard";

interface CommitBody {
  generationId?: string | null;
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

/** Persist a confirmed lookup draft as a real v2 course, mark the AI row committed. */
export async function POST(req: Request) {
  const { userId } = await v2GetUser(req);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: CommitBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { draft, generationId } = body;
  if (!draft || !Array.isArray(draft.tees) || draft.tees.length === 0) {
    return NextResponse.json({ error: "Draft missing tees" }, { status: 400 });
  }

  const admin = v2AdminClient();
  const normalized: NormalizedScorecard = {
    source: draft.source, confidence: draft.confidence, external_id: draft.external_id,
    course: draft.course, hole_count: draft.hole_count, tees: draft.tees,
    source_urls: draft.source_urls, notes: draft.notes,
  };

  let result;
  try {
    result = await persistScorecard(admin, normalized);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  if (generationId) {
    await admin
      .from("ai_generations")
      .update({ committed: true, committed_resource_id: result.course_id })
      .eq("id", generationId)
      .eq("user_id", userId);
  }

  const { data: course } = await admin
    .from("v2_courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("id", result.course_id)
    .single();

  return NextResponse.json({ course, tee_count: result.tee_count, hole_count: result.hole_count, reused: result.reused });
}
