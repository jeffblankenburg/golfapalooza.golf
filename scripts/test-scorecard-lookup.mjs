#!/usr/bin/env node
// Phase 0 feasibility test for AI scorecard lookup (Issue #110).
//
// Hits OpenRouter (Perplexity Sonar by default) with 20 real US courses,
// validates the structured response, spot-checks against known values, and
// prints a results table + summary so we can decide go/no-go before building
// the production feature.
//
// Usage:
//   node scripts/test-scorecard-lookup.mjs
//   node scripts/test-scorecard-lookup.mjs --model anthropic/claude-sonnet-4.5
//   node scripts/test-scorecard-lookup.mjs --courses 5 --concurrency 1
//
// Reads OPENROUTER_API_KEY from .env.local automatically.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// ───────────────────────── env loading ─────────────────────────
function loadDotEnv(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file may not exist; that's fine if env is set externally
  }
}
loadDotEnv(resolve(REPO_ROOT, ".env.local"));

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error("Missing OPENROUTER_API_KEY (looked in .env.local and process.env).");
  process.exit(1);
}

// ───────────────────────── args ─────────────────────────
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, cur, i, arr) => {
      if (cur.startsWith("--")) acc.push([cur.replace(/^--/, ""), arr[i + 1]]);
      return acc;
    }, [])
);
const MODEL = args.model || "perplexity/sonar";
const COURSE_LIMIT = args.courses ? parseInt(args.courses, 10) : 20;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 4;
const TIMEOUT_MS = args.timeout ? parseInt(args.timeout, 10) : 30000;

// ───────────────────────── test set ─────────────────────────
// Mix of: famous (easy), notable resorts (medium), regional clubs (realistic),
// muni/public (the long tail). `expected` is for spot-checking known values
// — fields are sourced from each course's own website / state association.
const TEST_COURSES = [
  // Famous tour venues
  {
    name: "Augusta National Golf Club",
    city: "Augusta",
    state: "GA",
    expected: { par: 72, hole_count: 18 },
    notes: "Famous, but no public scorecard — par/yards likely; rating/slope unknown to public.",
  },
  {
    name: "Pebble Beach Golf Links",
    city: "Pebble Beach",
    state: "CA",
    expected: { par: 72, hole_count: 18, slope_back: 144, rating_back: 75.5 },
  },
  {
    name: "Pinehurst No. 2",
    city: "Pinehurst",
    state: "NC",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "TPC Sawgrass Stadium Course",
    city: "Ponte Vedra Beach",
    state: "FL",
    expected: { par: 72, hole_count: 18, slope_back: 148 },
  },
  {
    name: "Bethpage Black Course",
    city: "Farmingdale",
    state: "NY",
    expected: { par: 71, hole_count: 18, slope_back: 152 },
  },
  // Notable resorts
  {
    name: "Whistling Straits Straits Course",
    city: "Sheboygan",
    state: "WI",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Bandon Dunes",
    city: "Bandon",
    state: "OR",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Erin Hills",
    city: "Erin",
    state: "WI",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Chambers Bay",
    city: "University Place",
    state: "WA",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Streamsong Resort Red Course",
    city: "Streamsong",
    state: "FL",
    expected: { par: 72, hole_count: 18 },
  },
  // Regional / mid-tier clubs (the realistic case for summer rounds)
  {
    name: "Muirfield Village Golf Club",
    city: "Dublin",
    state: "OH",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Scioto Country Club",
    city: "Columbus",
    state: "OH",
    expected: { par: 71, hole_count: 18 },
  },
  {
    name: "The Ohio State University Scarlet Course",
    city: "Columbus",
    state: "OH",
    expected: { par: 71, hole_count: 18 },
  },
  {
    name: "Inverness Club",
    city: "Toledo",
    state: "OH",
    expected: { par: 71, hole_count: 18 },
  },
  {
    name: "Aronimink Golf Club",
    city: "Newtown Square",
    state: "PA",
    expected: { par: 70, hole_count: 18 },
  },
  // Munis / public / long tail
  {
    name: "Cog Hill Dubsdread No. 4",
    city: "Lemont",
    state: "IL",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Brown Deer Park Golf Course",
    city: "Milwaukee",
    state: "WI",
    expected: { par: 71, hole_count: 18 },
  },
  {
    name: "Torrey Pines South Course",
    city: "La Jolla",
    state: "CA",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Black Mesa Golf Club",
    city: "La Mesilla",
    state: "NM",
    expected: { par: 72, hole_count: 18 },
  },
  {
    name: "Airport National Golf Course",
    city: "Cedar Rapids",
    state: "IA",
    notes: "Small-town muni — true long-tail test.",
  },
];

// ───────────────────────── prompt ─────────────────────────
const SYSTEM_PROMPT = `You are a golf scorecard data extraction assistant.

Your job: given a course name + location, search the web for the official scorecard from a primary source and return strictly-structured JSON. Primary sources, in order of preference:
1. The course's own website (scorecard, course-info, or rates page).
2. A state golf association or USGA-affiliated database (e.g., GHIN, World Handicap System).
3. Reputable golf databases that cite the course (e.g., the course's PGA tournament page).

HARD RULES — violating any of these makes your response unusable:
1. ONLY return data verifiable from a primary source. Cite the source URLs in source_urls.
2. If you cannot find a scorecard, return confidence="low" with tees=[]. NEVER GUESS slope, rating, or per-hole handicap_index.
3. Slope and course rating must come from a primary source. If only par + yards are available, set slope_rating and course_rating to null and use confidence="medium".
4. Per-hole handicap_index values must be unique 1..18 (or 1..9 for 9-hole courses) within a single tee. NEVER emit null for handicap_index.
5. **OMIT any tee where you do not have all 18 (or 9) holes with par AND handicap_index AND yards.** A tee object must be complete or absent. Do not include placeholder tees with null fields.
6. If you have par+yards but no handicap_index for any tee, omit that tee. If that leaves zero tees, return confidence="low" with tees=[].
7. The sum of hole pars must equal the tee's stated par. Double-check before responding.
8. Return ALL tee boxes you can verify completely — not just the championship/back tees.
9. For multi-loop facilities (e.g., 27 holes split into 3 nines), return confidence="low" unless the user's course name unambiguously identifies one specific 18-hole layout.
10. Output ONLY the JSON object. No markdown fences, no explanation, no preamble. Keep your response under 6000 tokens.`;

function userPrompt(course) {
  return `Find the official scorecard for:
- Course: ${course.name}
- City: ${course.city}
- State: ${course.state}

Return JSON in this exact shape:
{
  "course": {
    "name": "string (the canonical name from the source)",
    "city": "string",
    "state": "string (2-letter abbreviation)",
    "address": "string or null",
    "website": "string or null"
  },
  "hole_count": 18,
  "tees": [
    {
      "tee_name": "string (e.g. Black, Blue, White, Red)",
      "tee_color": "string or null (e.g. black, blue, white, red, gold)",
      "gender": "men" | "women" | "all",
      "course_rating": number or null,
      "slope_rating": integer 55-155 or null,
      "total_yards": integer or null,
      "par": integer,
      "holes": [
        { "hole_number": 1, "par": integer 3-6, "handicap_index": integer 1-18, "yards": integer or null },
        ... (18 entries, hole_number 1..18)
      ]
    }
  ],
  "confidence": "high" | "medium" | "low",
  "source_urls": ["https://...", ...],
  "notes": "string or null (anything ambiguous worth flagging)"
}

If you cannot find this course's scorecard, return:
{ "course": { "name": "${course.name}", "city": "${course.city}", "state": "${course.state}", "address": null, "website": null },
  "hole_count": 18, "tees": [], "confidence": "low", "source_urls": [], "notes": "Reason it could not be found." }`;
}

// ───────────────────────── OpenRouter client ─────────────────────────
async function callOpenRouter(course) {
  // Perplexity Sonar rejects response_format=json_object; OpenAI/Anthropic
  // accept it but the system prompt + post-parse already enforce JSON, so
  // we omit it for compatibility across all OpenRouter providers.
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(course) },
    ],
    temperature: 0,
    max_tokens: 8000,
  };

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://golfapalooza.golf",
        "X-Title": "Golfapalooza Scorecard Lookup (test)",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = await res.json();
    const latencyMs = Date.now() - start;
    const content = json?.choices?.[0]?.message?.content;
    const usage = json?.usage || {};
    if (!content) {
      return { ok: false, latencyMs, error: "Empty response content", raw: json };
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Some models wrap in fences. Strip.
      const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      try {
        parsed = JSON.parse(stripped);
      } catch {
        return { ok: false, latencyMs, error: `JSON parse error: ${e.message}`, raw: content.slice(0, 500) };
      }
    }
    return { ok: true, latencyMs, parsed, usage };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e.name === "AbortError" ? "Timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── validator ─────────────────────────
function validateScorecard(p) {
  const errors = [];
  const v = (cond, msg) => { if (!cond) errors.push(msg); };

  v(p?.course?.name, "course.name missing");
  v(p?.course?.state, "course.state missing");
  v([9, 18].includes(p?.hole_count), `hole_count invalid (${p?.hole_count})`);
  v(["high", "medium", "low"].includes(p?.confidence), `confidence invalid (${p?.confidence})`);
  v(Array.isArray(p?.tees), "tees not array");

  if (p?.confidence === "low") return { errors, warnings: [] };

  v(p?.tees?.length >= 1, "tees empty (but confidence not low)");

  const warnings = [];
  for (const [i, tee] of (p?.tees || []).entries()) {
    const ctx = `tees[${i}](${tee?.tee_name || "?"})`;
    v(tee.tee_name, `${ctx}.tee_name missing`);
    v(typeof tee.par === "number" && tee.par >= 60 && tee.par <= 80, `${ctx}.par out of range (${tee.par})`);

    if (tee.course_rating != null) {
      v(typeof tee.course_rating === "number" && tee.course_rating >= 55 && tee.course_rating <= 90,
        `${ctx}.course_rating out of range (${tee.course_rating})`);
    } else if (p.confidence === "high") {
      warnings.push(`${ctx}.course_rating null on a high-confidence response`);
    }
    if (tee.slope_rating != null) {
      v(Number.isInteger(tee.slope_rating) && tee.slope_rating >= 55 && tee.slope_rating <= 155,
        `${ctx}.slope_rating out of range (${tee.slope_rating})`);
    } else if (p.confidence === "high") {
      warnings.push(`${ctx}.slope_rating null on a high-confidence response`);
    }

    const expectedHoleCount = p.hole_count;
    v(Array.isArray(tee.holes) && tee.holes.length === expectedHoleCount,
      `${ctx}.holes length ${tee.holes?.length} != ${expectedHoleCount}`);

    if (Array.isArray(tee.holes) && tee.holes.length === expectedHoleCount) {
      const handicaps = new Set();
      let parSum = 0;
      for (const [j, h] of tee.holes.entries()) {
        const hctx = `${ctx}.holes[${j + 1}]`;
        v(h.hole_number === j + 1, `${hctx}.hole_number expected ${j + 1} got ${h.hole_number}`);
        v(h.par >= 3 && h.par <= 6, `${hctx}.par out of range (${h.par})`);
        v(h.handicap_index >= 1 && h.handicap_index <= expectedHoleCount,
          `${hctx}.handicap_index out of range (${h.handicap_index})`);
        handicaps.add(h.handicap_index);
        if (typeof h.par === "number") parSum += h.par;
      }
      v(handicaps.size === expectedHoleCount,
        `${ctx} handicap_index not unique (${handicaps.size}/${expectedHoleCount} unique values)`);
      if (typeof tee.par === "number" && parSum !== tee.par) {
        warnings.push(`${ctx} sum of hole pars ${parSum} != stated par ${tee.par}`);
      }
    }
  }

  // Source citation check
  if (p.confidence !== "low") {
    v(Array.isArray(p.source_urls) && p.source_urls.length >= 1,
      `source_urls missing (claimed confidence=${p.confidence})`);
  }

  return { errors, warnings };
}

function compareToExpected(parsed, expected) {
  if (!expected) return [];
  const diffs = [];
  if (expected.hole_count != null && parsed.hole_count !== expected.hole_count) {
    diffs.push(`hole_count: expected ${expected.hole_count}, got ${parsed.hole_count}`);
  }
  if (expected.par != null) {
    const tee = parsed.tees?.[0];
    if (tee?.par !== expected.par) diffs.push(`par[tee0]: expected ${expected.par}, got ${tee?.par}`);
  }
  if (expected.slope_back != null) {
    // back/championship tee = first or highest-rating tee
    const back = (parsed.tees || []).reduce((a, b) =>
      ((a?.course_rating ?? 0) >= (b?.course_rating ?? 0)) ? a : b, null);
    if (back?.slope_rating !== expected.slope_back) {
      diffs.push(`slope[back tee]: expected ${expected.slope_back}, got ${back?.slope_rating}`);
    }
  }
  if (expected.rating_back != null) {
    const back = (parsed.tees || []).reduce((a, b) =>
      ((a?.course_rating ?? 0) >= (b?.course_rating ?? 0)) ? a : b, null);
    if (Math.abs((back?.course_rating ?? 0) - expected.rating_back) > 0.5) {
      diffs.push(`rating[back tee]: expected ${expected.rating_back}, got ${back?.course_rating}`);
    }
  }
  return diffs;
}

// ───────────────────────── runner ─────────────────────────
async function runOne(course) {
  const r = await callOpenRouter(course);
  if (!r.ok) {
    return { course, ok: false, latencyMs: r.latencyMs, error: r.error };
  }
  const { errors, warnings } = validateScorecard(r.parsed);
  const diffs = compareToExpected(r.parsed, course.expected);
  return {
    course,
    ok: true,
    latencyMs: r.latencyMs,
    confidence: r.parsed.confidence,
    teeCount: r.parsed.tees?.length || 0,
    sourceCount: r.parsed.source_urls?.length || 0,
    schemaErrors: errors,
    warnings,
    expectationDiffs: diffs,
    parsed: r.parsed,
    usage: r.usage,
  };
}

async function runWithConcurrency(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }).map(async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        process.stdout.write(`  → [${i + 1}/${items.length}] ${items[i].name}\n`);
        results[i] = await fn(items[i]);
        const r = results[i];
        const stamp = r.ok
          ? `${r.confidence?.padEnd(6)} | ${r.teeCount}t | ${r.schemaErrors.length}e | ${r.expectationDiffs.length}d | ${r.latencyMs}ms`
          : `ERROR | ${r.latencyMs}ms | ${r.error}`;
        process.stdout.write(`    ✓ ${stamp}\n`);
      }
    })
  );
  return results;
}

function pad(s, n) { return String(s ?? "").slice(0, n).padEnd(n); }

function printResults(results) {
  console.log("\n" + "═".repeat(120));
  console.log("RESULTS");
  console.log("═".repeat(120));
  console.log(
    pad("#", 3) + pad("Course", 42) + pad("ST", 4) +
    pad("OK", 4) + pad("Conf", 7) + pad("Tees", 5) +
    pad("Src", 5) + pad("Errs", 5) + pad("Warn", 5) +
    pad("Diffs", 6) + pad("ms", 6)
  );
  console.log("─".repeat(120));
  for (const [i, r] of results.entries()) {
    if (!r.ok) {
      console.log(
        pad(i + 1, 3) + pad(r.course.name, 42) + pad(r.course.state, 4) +
        pad("FAIL", 4) + pad("-", 7) + pad("-", 5) + pad("-", 5) +
        pad("-", 5) + pad("-", 5) + pad("-", 6) + pad(r.latencyMs, 6) +
        ` ← ${r.error}`
      );
    } else {
      console.log(
        pad(i + 1, 3) + pad(r.course.name, 42) + pad(r.course.state, 4) +
        pad("✓", 4) + pad(r.confidence, 7) + pad(r.teeCount, 5) +
        pad(r.sourceCount, 5) + pad(r.schemaErrors.length, 5) +
        pad(r.warnings.length, 5) + pad(r.expectationDiffs.length, 6) +
        pad(r.latencyMs, 6)
      );
    }
  }
  console.log("─".repeat(120));

  // Detail block: show the gnarly cases
  const detail = results.filter(r =>
    !r.ok || r.schemaErrors.length > 0 || r.expectationDiffs.length > 0 || r.confidence === "low"
  );
  if (detail.length) {
    console.log("\nDETAILS (failures, schema errors, expectation diffs, low-confidence):\n");
    for (const r of detail) {
      console.log(`• ${r.course.name} (${r.course.city}, ${r.course.state})`);
      if (!r.ok) {
        console.log(`  ERROR: ${r.error}`);
      } else {
        console.log(`  confidence=${r.confidence}, tees=${r.teeCount}, sources=${r.sourceCount}, ms=${r.latencyMs}`);
        if (r.schemaErrors.length) {
          for (const e of r.schemaErrors) console.log(`  ✗ ${e}`);
        }
        if (r.warnings.length) {
          for (const w of r.warnings) console.log(`  ! ${w}`);
        }
        if (r.expectationDiffs.length) {
          for (const d of r.expectationDiffs) console.log(`  Δ ${d}`);
        }
        if (r.parsed?.notes) console.log(`  note: ${r.parsed.notes}`);
        if (r.parsed?.source_urls?.length) {
          for (const u of r.parsed.source_urls.slice(0, 3)) console.log(`  src: ${u}`);
        }
      }
      console.log();
    }
  }

  // Summary signals
  const ok = results.filter(r => r.ok);
  const high = ok.filter(r => r.confidence === "high" && r.schemaErrors.length === 0);
  const acceptable = ok.filter(r =>
    (r.confidence === "high" || r.confidence === "medium") &&
    r.schemaErrors.length === 0 &&
    r.expectationDiffs.length === 0
  );
  const wouldCommit = acceptable; // what we'd actually save server-side
  const avgLatency = ok.length ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : 0;
  const tokenIn = ok.reduce((s, r) => s + (r.usage?.prompt_tokens || 0), 0);
  const tokenOut = ok.reduce((s, r) => s + (r.usage?.completion_tokens || 0), 0);

  console.log("═".repeat(120));
  console.log("SUMMARY");
  console.log("═".repeat(120));
  console.log(`Model:                ${MODEL}`);
  console.log(`Tested:               ${results.length}`);
  console.log(`API calls succeeded:  ${ok.length} / ${results.length}`);
  console.log(`High-conf + clean:    ${high.length} / ${results.length}  (${pct(high.length, results.length)})`);
  console.log(`Would commit (acc):   ${wouldCommit.length} / ${results.length}  (${pct(wouldCommit.length, results.length)})`);
  console.log(`Avg latency:          ${avgLatency}ms`);
  console.log(`Tokens in / out:      ${tokenIn} / ${tokenOut}`);
  console.log();
  console.log("Go/no-go threshold from #110: would-commit ≥ 75% to proceed to Phase 1.");
  console.log(`Result:               ${pct(wouldCommit.length, results.length, true)} → ${wouldCommit.length / results.length >= 0.75 ? "GO" : "NO-GO"}`);
}

function pct(num, den, asString = false) {
  if (!den) return asString ? "0%" : 0;
  const p = Math.round((num / den) * 100);
  return asString ? `${p}%` : p;
}

// ───────────────────────── main ─────────────────────────
async function main() {
  const courses = TEST_COURSES.slice(0, COURSE_LIMIT);
  console.log(`\nPhase 0 feasibility test`);
  console.log(`  model:       ${MODEL}`);
  console.log(`  courses:     ${courses.length}`);
  console.log(`  concurrency: ${CONCURRENCY}`);
  console.log(`  timeout:     ${TIMEOUT_MS}ms`);
  console.log();

  const t0 = Date.now();
  const results = await runWithConcurrency(courses, CONCURRENCY, runOne);
  const totalMs = Date.now() - t0;

  printResults(results);
  console.log(`\nTotal wall time: ${(totalMs / 1000).toFixed(1)}s\n`);

  // Persist full output for inspection
  const outDir = resolve(REPO_ROOT, "tmp");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = resolve(outDir, `scorecard-lookup-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ model: MODEL, totalMs, results }, null, 2));
  console.log(`Full output saved: ${outFile}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
