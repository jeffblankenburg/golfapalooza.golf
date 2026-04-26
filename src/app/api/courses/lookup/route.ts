import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchGcApiCourses, isGcApiConfigured } from "@/lib/golf-course-api/client";
import {
  buildLookupKey,
  normalizeFromGcApi,
  type NormalizedScorecard,
} from "@/lib/courses/scorecard";
import { lookupScorecard, SCORECARD_MODEL } from "@/lib/ai/scorecard-task";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";

const TASK = "scorecard_lookup";
const AI_DAILY_LIMIT = 5;

interface LookupBody {
  name: string;
  state: string;
  city?: string;
}

/**
 * @swagger
 * /api/courses/lookup:
 *   post:
 *     summary: Lookup a course via the DB → GCAPI → AI cascade
 *     description: |
 *       Returns a draft scorecard payload for the user to confirm before
 *       persistence. Resolution stops at the first successful step:
 *         1. DB cache (lookup_key match) — instant, no external calls
 *         2. GolfCourseAPI search — sub-second, free under quota
 *         3. AI web lookup (Perplexity Sonar Pro via OpenRouter) — 5–15s, rate-limited per user
 *         4. Returns 404-style fallthrough so client falls back to manual entry
 *     tags: [Courses, AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, state]
 *             properties:
 *               name:    { type: string, example: "The Medallion Club" }
 *               city:    { type: string, example: "Westerville" }
 *               state:   { type: string, example: "OH", description: "2-letter state abbreviation" }
 *     responses:
 *       200:
 *         description: A draft scorecard the user must confirm.
 *       422:
 *         description: Cascade exhausted with no usable data — caller should fall back to manual entry.
 *       429:
 *         description: Per-user daily AI lookup quota exceeded.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: LookupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  const state = (body.state || "").trim().toUpperCase();
  const city = body.city?.trim() || undefined;
  if (!name || !state || state.length !== 2) {
    return NextResponse.json({ error: "name and 2-letter state are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const lookupKey = buildLookupKey(name, state, city);

  // ─── Step 1: cache by lookup_key ───
  const { data: cached } = await admin
    .from("courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("lookup_key", lookupKey)
    .maybeSingle();
  if (cached) {
    return NextResponse.json({
      step: "cache",
      committed: true,
      course: cached,
    });
  }

  // ─── Step 2: GolfCourseAPI ───
  if (isGcApiConfigured()) {
    try {
      const matches = await searchGcApiCourses(name);
      // A multi-course club returns several rows in the same state+city
      // (e.g. Norwood Hills' East Course + West Course). Surface all viable
      // ones so the user can pick which layout they played.
      const inLocation = matches.filter(c =>
        c.location?.state === state &&
        (!city || (c.location?.city || "").toLowerCase() === city.toLowerCase())
      );
      const inStateOnly = matches.filter(c => c.location?.state === state);
      const candidates = inLocation.length > 0 ? inLocation : inStateOnly;
      const cityMismatch = inLocation.length === 0 && inStateOnly.length > 0;

      // Normalize and drop entries that don't have usable tee data.
      const drafts = candidates
        .map(c => normalizeFromGcApi(c))
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map(d => serializeDraft(d, buildLookupKey(
          d.course.club_name && d.course.club_name !== d.course.name
            ? `${d.course.club_name} ${d.course.name}`
            : d.course.name,
          d.course.state || state,
          d.course.city || city,
        )));

      if (drafts.length === 1) {
        return NextResponse.json({
          step: "gcapi",
          committed: false,
          cityMismatch,
          draft: drafts[0],
        });
      }
      if (drafts.length > 1) {
        return NextResponse.json({
          step: "gcapi_multi",
          committed: false,
          cityMismatch,
          drafts,
        });
      }
    } catch (e) {
      // GCAPI errors (incl. rate limit) — silently fall through to AI.
      console.warn("GCAPI lookup failed:", (e as Error).message);
    }
  }

  // ─── Step 3: AI lookup (rate-limited) ───
  const rate = await checkAiRateLimit(admin, user.id, TASK, AI_DAILY_LIMIT);
  if (rate.exceeded) {
    return NextResponse.json(
      {
        step: "ai_rate_limited",
        committed: false,
        error: `Daily AI lookup limit reached (${rate.limit}/day). Add this course manually or try again tomorrow.`,
        rateLimit: rate,
      },
      { status: 429 }
    );
  }

  const inputHash = createHash("sha256").update(JSON.stringify({ name, state, city })).digest("hex");
  const result = await lookupScorecard(name, state, city);

  // Always log the call, even if it failed/low-confidence — useful for tuning.
  const { data: genRow } = await admin
    .from("ai_generations")
    .insert({
      user_id: user.id,
      task: TASK,
      model: result.model,
      input_hash: inputHash,
      input: { name, state, city },
      output: result.rawOutput as object | null,
      confidence: result.normalized?.confidence || null,
      cost_usd: result.costUsd ?? null,
      latency_ms: result.latencyMs,
      committed: false,
      error: result.error || (result.errors[0] ?? null),
    })
    .select("id")
    .single();

  if (result.normalized) {
    return NextResponse.json({
      step: "ai",
      committed: false,
      generationId: genRow?.id ?? null,
      warnings: result.warnings,
      draft: serializeDraft(result.normalized, lookupKey),
    });
  }

  // ─── Step 4: cascade exhausted → fall through to manual ───
  return NextResponse.json(
    {
      step: "manual",
      committed: false,
      generationId: genRow?.id ?? null,
      reason: result.errors[0] || "Could not find this course",
      // Pre-fill what we know so the manual form isn't empty.
      prefill: { name, city, state },
    },
    { status: 422 }
  );
}

function serializeDraft(n: NormalizedScorecard, lookupKey: string) {
  return {
    lookup_key: lookupKey,
    confidence: n.confidence,
    source: n.source,
    course: n.course,
    hole_count: n.hole_count,
    tees: n.tees,
    source_urls: n.source_urls,
    notes: n.notes,
    external_id: n.external_id,
    model: n.source === "ai" ? SCORECARD_MODEL : null,
  };
}
