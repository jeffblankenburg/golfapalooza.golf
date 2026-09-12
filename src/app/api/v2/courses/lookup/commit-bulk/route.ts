import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { persistScorecard } from "@/lib/v2/courses/persist";
import type { NormalizedScorecard } from "@/lib/v2/courses/scorecard";

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

/** Persist multiple confirmed drafts (multi-course club "Import all"). */
export async function POST(req: Request) {
  const { userId } = await v2GetUser(req);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: BulkBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const drafts = Array.isArray(body.drafts) ? body.drafts : [];
  if (drafts.length === 0) return NextResponse.json({ error: "drafts array is required" }, { status: 400 });
  if (drafts.length > 25) return NextResponse.json({ error: "Too many drafts in one request" }, { status: 400 });

  const admin = v2AdminClient();
  const courses: unknown[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (!d || !Array.isArray(d.tees) || d.tees.length === 0) {
      errors.push({ index: i, error: "Draft missing tees" });
      continue;
    }
    const normalized: NormalizedScorecard = {
      source: d.source, confidence: d.confidence, external_id: d.external_id,
      course: d.course, hole_count: d.hole_count, tees: d.tees,
      source_urls: d.source_urls, notes: d.notes,
    };
    try {
      const result = await persistScorecard(admin, normalized);
      const { data: course } = await admin
        .from("v2_courses")
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
      .eq("user_id", userId);
  }

  return NextResponse.json({ courses, errors });
}
