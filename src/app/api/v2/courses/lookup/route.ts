import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { searchGcApiCourses, isGcApiConfigured } from "@/lib/v2/golf-course-api/client";
import {
  buildLookupKey,
  normalizeFromGcApi,
  type NormalizedScorecard,
} from "@/lib/v2/courses/scorecard";
import { lookupScorecard, SCORECARD_MODEL } from "@/lib/v2/ai/scorecard-task";
import { checkAiRateLimit } from "@/lib/v2/ai/rate-limit";

const TASK = "scorecard_lookup";
const AI_DAILY_LIMIT = 5;

interface LookupBody { name: string; state: string; city?: string; }

interface ExistingCourse {
  id: string; name: string; club_name: string | null; city: string | null; state: string | null;
  hole_count: number; source: "manual" | "gcapi" | "ai"; verified: boolean;
  lookup_key: string | null; external_id: string | null;
}

/**
 * Course lookup cascade for v2 (writes into the universal v2 library):
 *   1. DB cache by lookup_key  2. GolfCourseAPI  3. AI web lookup (rate-limited)
 *   4. 422 fallthrough → manual entry. Returns drafts the user confirms.
 */
export async function POST(req: Request) {
  const { userId } = await v2GetUser(req);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: LookupBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const name = (body.name || "").trim();
  const state = (body.state || "").trim().toUpperCase();
  const city = body.city?.trim() || undefined;
  if (!name || !state || state.length !== 2) {
    return NextResponse.json({ error: "name and 2-letter state are required" }, { status: 400 });
  }

  const admin = v2AdminClient();
  const lookupKey = buildLookupKey(name, state, city);

  // ── Step 1: cache ──
  const { data: cached } = await admin
    .from("v2_courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("lookup_key", lookupKey)
    .maybeSingle();
  if (cached) return NextResponse.json({ step: "cache", committed: true, course: cached });

  // ── Step 2: GolfCourseAPI ──
  if (isGcApiConfigured()) {
    try {
      const matches = await searchGcApiCourses(name);
      const inLocation = matches.filter(c =>
        c.location?.state === state &&
        (!city || (c.location?.city || "").toLowerCase() === city.toLowerCase()));
      const inStateOnly = matches.filter(c => c.location?.state === state);
      const candidates = inLocation.length > 0 ? inLocation : inStateOnly;
      const cityMismatch = inLocation.length === 0 && inStateOnly.length > 0;

      const drafts = candidates
        .map(c => normalizeFromGcApi(c))
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map(d => serializeDraft(d, buildLookupKey(
          d.course.club_name && d.course.club_name !== d.course.name ? `${d.course.club_name} ${d.course.name}` : d.course.name,
          d.course.state || state,
          d.course.city || city,
        )));

      const draftKeys = drafts.map(d => d.lookup_key);
      const draftExternalIds = drafts.map(d => d.external_id).filter((v): v is string => !!v);
      const draftStates = Array.from(new Set(drafts.map(d => d.course.state).filter((v): v is string => !!v)));
      const existingMap = new Map<string, ExistingCourse>();
      const matchedDraftKeys = new Set<string>();

      if (draftKeys.length > 0) {
        const { data } = await admin
          .from("v2_courses")
          .select("id, name, club_name, city, state, hole_count, source, verified, lookup_key, external_id")
          .in("lookup_key", draftKeys);
        for (const c of data || []) { existingMap.set(c.id, c as ExistingCourse); if (c.lookup_key) matchedDraftKeys.add(c.lookup_key); }
      }
      if (draftExternalIds.length > 0) {
        const { data } = await admin
          .from("v2_courses")
          .select("id, name, club_name, city, state, hole_count, source, verified, lookup_key, external_id")
          .in("external_id", draftExternalIds);
        for (const c of data || []) {
          existingMap.set(c.id, c as ExistingCourse);
          const owner = drafts.find(d => d.external_id === c.external_id);
          if (owner) matchedDraftKeys.add(owner.lookup_key);
        }
      }
      if (draftStates.length > 0) {
        const { data } = await admin
          .from("v2_courses")
          .select("id, name, club_name, city, state, hole_count, source, verified, lookup_key, external_id")
          .in("state", draftStates);
        for (const c of data || []) {
          if (existingMap.has(c.id)) continue;
          const computedKey = buildLookupKey(
            c.club_name && c.club_name !== c.name ? `${c.club_name} ${c.name}` : c.name, c.state || "", c.city);
          if (draftKeys.includes(computedKey)) { existingMap.set(c.id, c as ExistingCourse); matchedDraftKeys.add(computedKey); }
        }
      }

      const newDrafts = drafts.filter(d => !matchedDraftKeys.has(d.lookup_key));
      const existingCourses = Array.from(existingMap.values());

      if (drafts.length > 0 && newDrafts.length === 0) {
        return NextResponse.json({ step: "all_imported", committed: true, courses: existingCourses });
      }
      if (newDrafts.length === 1 && existingCourses.length === 0) {
        return NextResponse.json({ step: "gcapi", committed: false, cityMismatch, draft: newDrafts[0] });
      }
      if (newDrafts.length >= 1) {
        return NextResponse.json({ step: "gcapi_multi", committed: false, cityMismatch, drafts: newDrafts, alreadyImported: existingCourses });
      }
    } catch (e) {
      console.warn("GCAPI lookup failed:", (e as Error).message);
    }
  }

  // ── Step 3: AI (rate-limited) ──
  const rate = await checkAiRateLimit(admin, userId, TASK, AI_DAILY_LIMIT);
  if (rate.exceeded) {
    return NextResponse.json({
      step: "ai_rate_limited", committed: false,
      error: `Daily AI lookup limit reached (${rate.limit}/day). Add this course manually or try again tomorrow.`,
      rateLimit: rate,
    }, { status: 429 });
  }

  const inputHash = createHash("sha256").update(JSON.stringify({ name, state, city })).digest("hex");
  const result = await lookupScorecard(name, state, city);

  const { data: genRow } = await admin
    .from("ai_generations")
    .insert({
      user_id: userId, task: TASK, model: result.model, input_hash: inputHash,
      input: { name, state, city }, output: result.rawOutput as object | null,
      confidence: result.normalized?.confidence || null, cost_usd: result.costUsd ?? null,
      latency_ms: result.latencyMs, committed: false, error: result.error || (result.errors[0] ?? null),
    })
    .select("id")
    .single();

  if (result.normalized) {
    const aiDraft = serializeDraft(result.normalized, lookupKey);
    const { data: byKey } = await admin
      .from("v2_courses")
      .select("id, name, club_name, city, state, hole_count, source, verified")
      .eq("lookup_key", aiDraft.lookup_key)
      .maybeSingle();
    if (byKey) return NextResponse.json({ step: "cache", committed: true, course: byKey });
    return NextResponse.json({ step: "ai", committed: false, generationId: genRow?.id ?? null, warnings: result.warnings, draft: aiDraft });
  }

  return NextResponse.json({
    step: "manual", committed: false, generationId: genRow?.id ?? null,
    reason: result.errors[0] || "Could not find this course",
    prefill: { name, city, state },
  }, { status: 422 });
}

function serializeDraft(n: NormalizedScorecard, lookupKey: string) {
  return {
    lookup_key: lookupKey, confidence: n.confidence, source: n.source, course: n.course,
    hole_count: n.hole_count, tees: n.tees, source_urls: n.source_urls, notes: n.notes,
    external_id: n.external_id, model: n.source === "ai" ? SCORECARD_MODEL : null,
  };
}
