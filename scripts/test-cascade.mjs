#!/usr/bin/env node
// Run the full lookup cascade (GCAPI → AI sonar-pro) against a real-world
// list of courses the Loozers actually play. Tells us whether the design
// works for the long-tail muni case that #110 cares about.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function loadDotEnv(path) {
  try {
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadDotEnv(resolve(REPO_ROOT, ".env.local"));

const GC_KEY = process.env.GOLF_COURSE_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
if (!GC_KEY || !OR_KEY) { console.error("Missing GOLF_COURSE_API_KEY or OPENROUTER_API_KEY"); process.exit(1); }

const COURSES = [
  ["The Links at Groveport", "Groveport", "OH"],
  ["Norwood Hills Country Club", "St. Louis", "MO"],
  ["Springvale Golf Club", "North Olmsted", "OH"],
  ["Turnberry Golf Club", "Pickerington", "OH"],
  ["The Medallion Club", "Westerville", "OH"],
  ["Royal American Links", "Galena", "OH"],
  ["Delaware Golf Club", "Delaware", "OH"],
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ───────────────────────── GCAPI ─────────────────────────
async function gcSearch(name, attempt = 1) {
  const url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(name)}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Key ${GC_KEY}` } });
  const ms = Date.now() - t0;
  if (res.status === 429 && attempt <= 3) { await sleep(2000 * attempt); return gcSearch(name, attempt + 1); }
  if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
  const json = await res.json();
  return { ok: true, ms, courses: json.courses || [] };
}

function gcEvaluate(matches, expectedCity, expectedState) {
  // Pick the best match: same state and city if possible, else same state.
  const exact = matches.find(c =>
    c.location?.state === expectedState &&
    (c.location?.city || "").toLowerCase() === expectedCity.toLowerCase()
  );
  const stateOnly = matches.find(c => c.location?.state === expectedState);
  const best = exact || stateOnly || matches[0];
  if (!best) return null;
  const allTees = [...(best.tees?.male || []), ...(best.tees?.female || [])];
  const fullTees = allTees.filter(t =>
    t.holes?.length === t.number_of_holes && t.course_rating > 0 && t.slope_rating > 0
  );
  return {
    matchName: best.club_name,
    matchCity: best.location?.city || "?",
    matchState: best.location?.state || "?",
    teeCount: fullTees.length,
    cityMatched: !!exact,
    confidence: exact ? "high" : (stateOnly ? "medium" : "low"),
  };
}

// ───────────────────────── AI ─────────────────────────
const SYSTEM_PROMPT = `You are a golf scorecard data extraction assistant.

Your job: given a course name + location, search for the official scorecard from a primary source and return strictly-structured JSON.

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
4. Per-hole handicap_index values must be unique 1..18 (or 1..9) within a single tee. NEVER emit null for handicap_index.
5. OMIT any tee where you don't have all 18 (or 9) holes with par AND handicap_index. A tee object must be complete or absent.
6. Sum of hole pars must equal the tee's stated par.
7. Output ONLY the JSON object. No markdown fences, no explanation. Keep response under 6000 tokens.`;

function userPrompt(name, city, state) {
  return `Find the official scorecard for:
- Course: ${name}
- City: ${city}
- State: ${state}

Return JSON in this shape:
{
  "course": { "name": str, "city": str, "state": str (2-letter), "address": str|null, "website": str|null },
  "hole_count": 18 | 9,
  "tees": [
    { "tee_name": str, "tee_color": str|null, "gender": "men"|"women"|"all",
      "course_rating": num|null, "slope_rating": int|null, "total_yards": int|null, "par": int,
      "holes": [{ "hole_number": int, "par": int, "handicap_index": int, "yards": int|null }, ...18] }
  ],
  "confidence": "high" | "medium" | "low",
  "source_urls": [str, ...],
  "notes": str|null
}

If you cannot find this course, return confidence="low" with tees=[].`;
}

async function aiLookup(name, city, state) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json",
      "HTTP-Referer": "https://golfapalooza.golf", "X-Title": "Golfapalooza",
    },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(name, city, state) },
      ],
      temperature: 0,
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, ms, error: "no content" };
  let parsed;
  try { parsed = JSON.parse(content); }
  catch {
    try { parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()); }
    catch (e) { return { ok: false, ms, error: `parse: ${e.message}` }; }
  }
  return { ok: true, ms, parsed, usage: json.usage };
}

function aiEvaluate(parsed) {
  if (!parsed) return null;
  const tees = Array.isArray(parsed.tees) ? parsed.tees : [];
  const validTees = tees.filter(t =>
    t.tee_name && Array.isArray(t.holes) && t.holes.length === parsed.hole_count &&
    t.holes.every(h => h.par >= 3 && h.par <= 6 && h.handicap_index >= 1 && h.handicap_index <= parsed.hole_count)
  );
  return {
    confidence: parsed.confidence,
    teeCount: validTees.length,
    sourceCount: (parsed.source_urls || []).length,
    sources: (parsed.source_urls || []).slice(0, 2),
    notes: parsed.notes,
  };
}

// ───────────────────────── runner ─────────────────────────
function pad(s, n) { return String(s ?? "").slice(0, n).padEnd(n); }

async function main() {
  console.log(`\nCascade test (GCAPI → AI sonar-pro) — ${COURSES.length} real courses\n`);

  const results = [];
  for (const [i, [name, city, state]] of COURSES.entries()) {
    console.log(`[${i + 1}/${COURSES.length}] ${name} (${city}, ${state})`);

    // Step 1: GCAPI
    if (i > 0) await sleep(1200);
    const gc = await gcSearch(name);
    let gcResult = null;
    let stoppedAt = null;
    if (gc.ok && gc.courses.length > 0) {
      gcResult = gcEvaluate(gc.courses, city, state);
      if (gcResult && gcResult.cityMatched && gcResult.teeCount > 0) {
        console.log(`  ✓ GCAPI hit: ${gcResult.matchName} (${gcResult.matchCity}, ${gcResult.matchState}) — ${gcResult.teeCount} tees`);
        stoppedAt = "gcapi";
        results.push({ name, city, state, stoppedAt, gc: gcResult, ai: null, gcMs: gc.ms, aiMs: 0 });
        continue;
      } else if (gcResult) {
        console.log(`  ~ GCAPI partial: ${gcResult.matchName} (${gcResult.matchCity}, ${gcResult.matchState}) — ${gcResult.teeCount} tees, city ${gcResult.cityMatched ? "matched" : "off"}`);
      } else {
        console.log(`  ✗ GCAPI: ${gc.courses.length} matches, none usable`);
      }
    } else if (gc.ok) {
      console.log(`  ✗ GCAPI: 0 matches`);
    } else {
      console.log(`  ✗ GCAPI: ${gc.error}`);
    }

    // Step 2: AI
    const ai = await aiLookup(name, city, state);
    let aiResult = null;
    if (!ai.ok) {
      console.log(`  ✗ AI error: ${ai.error}`);
      stoppedAt = "manual";
    } else {
      aiResult = aiEvaluate(ai.parsed);
      if (aiResult && aiResult.confidence !== "low" && aiResult.teeCount > 0) {
        console.log(`  ✓ AI hit: confidence=${aiResult.confidence}, ${aiResult.teeCount} tees, ${aiResult.sourceCount} sources`);
        if (aiResult.sources.length) console.log(`    src: ${aiResult.sources[0]}`);
        stoppedAt = "ai";
      } else {
        console.log(`  ✗ AI: ${aiResult?.confidence || "?"} confidence, ${aiResult?.teeCount || 0} usable tees → manual fallback`);
        if (aiResult?.notes) console.log(`    note: ${aiResult.notes.slice(0, 140)}`);
        stoppedAt = "manual";
      }
    }

    results.push({ name, city, state, stoppedAt, gc: gcResult, ai: aiResult, gcMs: gc.ms, aiMs: ai.ms });
  }

  // Summary
  const at = (s) => results.filter(r => r.stoppedAt === s).length;
  console.log(`\n${"─".repeat(80)}`);
  console.log(`SUMMARY (n=${results.length})`);
  console.log(`${"─".repeat(80)}`);
  console.log(`Resolved by GCAPI:   ${at("gcapi")}/${results.length}  (${Math.round(at("gcapi")/results.length*100)}%)`);
  console.log(`Resolved by AI:      ${at("ai")}/${results.length}  (${Math.round(at("ai")/results.length*100)}%)`);
  console.log(`Fell to manual:      ${at("manual")}/${results.length}  (${Math.round(at("manual")/results.length*100)}%)`);
  console.log(`Auto-resolved total: ${at("gcapi") + at("ai")}/${results.length}  (${Math.round((at("gcapi") + at("ai"))/results.length*100)}%)`);
}

main().catch(e => { console.error(e); process.exit(1); });
