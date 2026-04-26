// "Scorecard lookup" AI task: given a course name + city + state, ask the
// model to find an official scorecard from preferred databases first
// (BlueGolf, 18Birdies, Golfify, GolfPass, course websites) and return a
// strictly-structured payload. The validator/normalizer in
// src/lib/courses/scorecard.ts decides whether to keep the result.

import { chatJson, parseLooseJson } from "./openrouter";
import { normalizeFromAi, type NormalizedScorecard } from "@/lib/courses/scorecard";

// Per the Phase 0 model comparison (scripts/test-models.mjs against the
// real Loozer course list): Haiku 4.5 with web search hit 7/7, beating
// sonar-pro (6/7) at ~25% more cost, and matching Sonnet 4.5 at 40% the
// cost and half the latency.
export const SCORECARD_MODEL = "anthropic/claude-haiku-4.5:online";

const SYSTEM_PROMPT = `You are a golf scorecard data extraction assistant.

Given a course name + location, search for the official scorecard from a primary source and return strictly-structured JSON.

PREFERRED SOURCES — search these established scorecard databases FIRST before falling back to general web search:
1. BlueGolf (bluegolf.com) — has scorecards for thousands of US clubs.
2. 18Birdies (18birdies.com) — large user-contributed scorecard database.
3. Golfify (golfify.io) — aggregated scorecard data.
4. GolfPass (golfpass.com) — Golf Channel's course directory with scorecards.
5. The course's own website (scorecard, course-info, or rates page).
6. State golf association sites (e.g., OGA, NCGA) for slope/rating verification.

Only fall back to general web search if none of the above have the course.

HARD RULES — violating any of these makes your response unusable:
1. ONLY return data verifiable from a primary source. Cite the source URLs in source_urls.
2. If you cannot find a scorecard, return confidence="low" with tees=[]. NEVER GUESS slope, rating, or per-hole handicap_index.
3. Slope and course rating must come from a primary source. If only par + yards are available, set slope_rating and course_rating to null and use confidence="medium".
4. Per-hole handicap_index values must be unique 1..18 (or 1..9 for 9-hole courses) within a single tee. NEVER emit null for handicap_index.
5. OMIT any tee where you don't have all 18 (or 9) holes with par AND handicap_index. A tee object must be complete or absent.
6. Sum of hole pars must equal the tee's stated par.
7. Return ALL tee boxes you can verify completely.
8. For multi-loop facilities (e.g., 27 holes split into 3 nines), return confidence="low" unless the user's course name unambiguously identifies one specific 18-hole layout.
9. Output ONLY the JSON object. No markdown fences, no explanation. Keep response under 6000 tokens.`;

function userPrompt(name: string, city: string | undefined, state: string): string {
  return `Find the official scorecard for:
- Course: ${name}
- City: ${city || "(not specified)"}
- State: ${state}

Return JSON in this shape:
{
  "course": { "name": str, "city": str, "state": str (2-letter), "address": str|null (STREET ADDRESS ONLY — no city/state/zip), "website": str|null, "club_name": str|null },
  "hole_count": 18 | 9,
  "tees": [
    { "tee_name": str, "tee_color": str|null, "gender": "men"|"women"|"all",
      "course_rating": num|null, "slope_rating": int 55-155|null, "total_yards": int|null, "par": int,
      "holes": [{ "hole_number": int, "par": int 3-6, "handicap_index": int 1-18, "yards": int|null }, ...18] }
  ],
  "confidence": "high" | "medium" | "low",
  "source_urls": [str, ...],
  "notes": str|null
}

If you cannot find this course's scorecard, return confidence="low" with tees=[].`;
}

export interface ScorecardLookupResult {
  ok: boolean;
  normalized: NormalizedScorecard | null;
  rawOutput: unknown;
  errors: string[];
  warnings: string[];
  model: string;
  modelUsed?: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  error?: string;
}

/**
 * Run a scorecard lookup. Returns the normalized payload (ready for
 * persistScorecard) or details on why it couldn't be used. Never throws on
 * model errors — those become `{ ok: false, error }` so the caller can fall
 * through to the manual entry path.
 */
export async function lookupScorecard(
  name: string,
  state: string,
  city?: string
): Promise<ScorecardLookupResult> {
  const result = await chatJson({
    model: SCORECARD_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(name, city, state) },
    ],
    temperature: 0,
    max_tokens: 8000,
    timeoutMs: 45000,
  });

  if (!result.ok || !result.content) {
    return {
      ok: false,
      normalized: null,
      rawOutput: null,
      errors: [result.error || "openrouter call failed"],
      warnings: [],
      model: SCORECARD_MODEL,
      latencyMs: result.latency_ms,
      error: result.error,
    };
  }

  let raw: unknown;
  try {
    raw = parseLooseJson(result.content);
  } catch (e) {
    return {
      ok: false,
      normalized: null,
      rawOutput: result.content,
      errors: [`json parse failed: ${(e as Error).message}`],
      warnings: [],
      model: SCORECARD_MODEL,
      modelUsed: result.model_used,
      latencyMs: result.latency_ms,
      tokensIn: result.usage?.prompt_tokens,
      tokensOut: result.usage?.completion_tokens,
      costUsd: result.cost_usd,
    };
  }

  const { normalized, errors, warnings } = normalizeFromAi(raw);
  return {
    ok: !!normalized,
    normalized,
    rawOutput: raw,
    errors,
    warnings,
    model: SCORECARD_MODEL,
    modelUsed: result.model_used,
    latencyMs: result.latency_ms,
    tokensIn: result.usage?.prompt_tokens,
    tokensOut: result.usage?.completion_tokens,
    costUsd: result.cost_usd,
  };
}
