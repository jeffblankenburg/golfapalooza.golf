#!/usr/bin/env node
// Compare AI scorecard-lookup models against the Loozer course list.
// Goal: trade off cost vs accuracy with a real matrix.
//
// Models tested:
//   - perplexity/sonar              (cheap web search baseline)
//   - perplexity/sonar-pro          (current pick from cascade design)
//   - anthropic/claude-sonnet-4.5:online   (Anthropic Sonnet + web search)
//   - anthropic/claude-haiku-4.5:online    (Anthropic Haiku, cheaper)
//
// Each model is asked the same 7 questions in parallel; results are scored
// on the same validator (confidence + at least one usable tee).

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

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error("Missing OPENROUTER_API_KEY"); process.exit(1); }

const MODELS = [
  "perplexity/sonar",
  "perplexity/sonar-pro",
  "anthropic/claude-sonnet-4.5:online",
  "anthropic/claude-haiku-4.5:online",
];

const COURSES = [
  ["The Links at Groveport", "Groveport", "OH"],
  ["Norwood Hills Country Club", "St. Louis", "MO"],
  ["Springvale Golf Club", "North Olmsted", "OH"],
  ["Turnberry Golf Club", "Pickerington", "OH"],
  ["The Medallion Club", "Westerville", "OH"],
  ["Royal American Links", "Galena", "OH"],
  ["Delaware Golf Club", "Delaware", "OH"],
];

const SYSTEM_PROMPT = `You are a golf scorecard data extraction assistant.

Given a course name + location, search for the official scorecard from a primary source and return strictly-structured JSON.

PREFERRED SOURCES — search these established scorecard databases FIRST:
1. BlueGolf (bluegolf.com)
2. 18Birdies (18birdies.com)
3. Golfify (golfify.io)
4. GolfPass (golfpass.com)
5. The course's own website
6. State golf association sites

HARD RULES:
1. ONLY return data verifiable from a primary source. Cite source URLs.
2. If you cannot find a scorecard, return confidence="low" with tees=[]. NEVER GUESS.
3. Slope and rating must come from a primary source. If only par+yards available, slope/rating=null and confidence="medium".
4. Per-hole handicap_index must be unique 1..18 within a tee. NEVER null.
5. OMIT any tee where you don't have all 18 holes complete with par AND handicap_index.
6. Sum of hole pars must equal stated tee par.
7. Output ONLY the JSON. No markdown fences. Under 6000 tokens.`;

function userPrompt(name, city, state) {
  return `Find the official scorecard for: ${name}, ${city}, ${state}.
Return JSON: { "course": {name, city, state, address|null, website|null}, "hole_count": 18|9, "tees": [{tee_name, tee_color|null, gender:"men"|"women"|"all", course_rating:num|null, slope_rating:int|null, total_yards:int|null, par:int, holes:[{hole_number, par:3-6, handicap_index:1-18, yards|null}, ...18]}], "confidence": "high"|"medium"|"low", "source_urls": [...], "notes": str|null }
If not found: confidence="low", tees=[].`;
}

async function callModel(model, course) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
        "HTTP-Referer": "https://golfapalooza.golf", "X-Title": "Golfapalooza",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(course[0], course[1], course[2]) },
        ],
        temperature: 0,
        max_tokens: 8000,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}: ${t.slice(0, 120)}` };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    let parsed = null;
    try { parsed = JSON.parse(content); }
    catch {
      try { parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()); }
      catch {}
    }
    return {
      ok: true,
      ms: Date.now() - t0,
      parsed,
      tokensIn: json?.usage?.prompt_tokens || 0,
      tokensOut: json?.usage?.completion_tokens || 0,
      cost: typeof json?.usage?.cost === "number" ? json.usage.cost : null,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(timer); }
}

function evaluate(parsed) {
  if (!parsed) return { confidence: "parse-fail", validTees: 0, sources: 0 };
  const tees = Array.isArray(parsed.tees) ? parsed.tees : [];
  const valid = tees.filter(t => {
    if (!t.tee_name || !Array.isArray(t.holes)) return false;
    if (t.holes.length !== parsed.hole_count) return false;
    const ok = t.holes.every(h => h.par >= 3 && h.par <= 6 && h.handicap_index >= 1 && h.handicap_index <= parsed.hole_count);
    if (!ok) return false;
    const handicaps = new Set(t.holes.map(h => h.handicap_index));
    return handicaps.size === parsed.hole_count;
  });
  return {
    confidence: parsed.confidence || "?",
    validTees: valid.length,
    sources: (parsed.source_urls || []).length,
    hasRating: valid.some(t => t.course_rating != null && t.slope_rating != null),
  };
}

function isCommitable(ev) {
  return (ev.confidence === "high" || ev.confidence === "medium") && ev.validTees >= 1;
}

async function runOne(model) {
  const results = [];
  let totalIn = 0, totalOut = 0, totalCost = 0, totalMs = 0, errors = 0, commits = 0;
  // Run all 7 in parallel since they don't share rate limits per model.
  const responses = await Promise.all(COURSES.map(c => callModel(model, c)));
  for (const [i, r] of responses.entries()) {
    if (!r.ok) {
      errors++;
      results.push({ course: COURSES[i][0], state: COURSES[i][2], ok: false, error: r.error, ms: r.ms });
      continue;
    }
    const ev = evaluate(r.parsed);
    if (isCommitable(ev)) commits++;
    totalIn += r.tokensIn || 0;
    totalOut += r.tokensOut || 0;
    if (r.cost) totalCost += r.cost;
    totalMs += r.ms;
    results.push({
      course: COURSES[i][0], state: COURSES[i][2], ok: true, ms: r.ms,
      ...ev, sourcesList: (r.parsed?.source_urls || []).slice(0, 1),
    });
  }
  return { model, results, commits, errors, totalIn, totalOut, totalCost, avgMs: Math.round(totalMs / Math.max(1, COURSES.length - errors)) };
}

function pad(s, n) { return String(s ?? "").slice(0, n).padEnd(n); }

async function main() {
  console.log(`\nModel comparison — ${MODELS.length} models × ${COURSES.length} courses\n`);

  // Run models sequentially so the OpenRouter logs stay readable; calls
  // within each model run in parallel.
  const all = [];
  for (const model of MODELS) {
    process.stdout.write(`Testing ${model}... `);
    const t0 = Date.now();
    const r = await runOne(model);
    process.stdout.write(`${r.commits}/${COURSES.length} commits, ${Math.round((Date.now() - t0)/1000)}s wall\n`);
    all.push(r);
  }

  // Per-course matrix
  console.log(`\n${"─".repeat(120)}`);
  console.log("PER-COURSE MATRIX (✓ = high/medium confidence + ≥1 valid tee, ~ = low confidence, ✗ = fail)");
  console.log("─".repeat(120));
  console.log(pad("Course", 32) + MODELS.map(m => pad(m.replace(/^.*\//, "").replace(/:online$/, "*"), 22)).join(""));
  console.log("─".repeat(120));
  for (let i = 0; i < COURSES.length; i++) {
    const cells = all.map(a => {
      const r = a.results[i];
      if (!r.ok) return "✗ error";
      if (isCommitable(r)) return `✓ ${r.confidence}/${r.validTees}t/${r.sources}s`;
      return `~ ${r.confidence}/${r.validTees}t`;
    });
    console.log(pad(COURSES[i][0], 32) + cells.map(c => pad(c, 22)).join(""));
  }

  // Summary
  console.log(`\n${"─".repeat(120)}`);
  console.log("SUMMARY (n=" + COURSES.length + ", * = :online suffix)");
  console.log("─".repeat(120));
  console.log(pad("Model", 40) + pad("Commits", 10) + pad("Errors", 8) + pad("Avg ms", 9) + pad("In tok", 9) + pad("Out tok", 9) + pad("Cost USD", 12));
  console.log("─".repeat(120));
  for (const a of all) {
    console.log(
      pad(a.model, 40) +
      pad(`${a.commits}/${COURSES.length}`, 10) +
      pad(a.errors, 8) +
      pad(a.avgMs, 9) +
      pad(a.totalIn, 9) +
      pad(a.totalOut, 9) +
      pad(a.totalCost ? `$${a.totalCost.toFixed(4)}` : "n/a", 12)
    );
  }
  console.log(`\nNote: cost from OpenRouter usage.cost when reported; otherwise n/a (model-side billing only).`);

  // Save full output
  const fs = await import("node:fs");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(REPO_ROOT, "tmp", `model-comparison-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`\nFull output saved: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
