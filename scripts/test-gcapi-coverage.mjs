#!/usr/bin/env node
// Quick GolfCourseAPI coverage check — same 20 courses as the AI test.
// Goal: figure out how often Step 1 (GCAPI) succeeds before we even need AI.
//
// Usage: node scripts/test-gcapi-coverage.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

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
  } catch {}
}
loadDotEnv(resolve(REPO_ROOT, ".env.local"));

const KEY = process.env.GOLF_COURSE_API_KEY;
if (!KEY) {
  console.error("Missing GOLF_COURSE_API_KEY");
  process.exit(1);
}

const COURSES = [
  ["Augusta National Golf Club", "Augusta", "GA"],
  ["Pebble Beach Golf Links", "Pebble Beach", "CA"],
  ["Pinehurst No. 2", "Pinehurst", "NC"],
  ["TPC Sawgrass Stadium Course", "Ponte Vedra Beach", "FL"],
  ["Bethpage Black Course", "Farmingdale", "NY"],
  ["Whistling Straits Straits Course", "Sheboygan", "WI"],
  ["Bandon Dunes", "Bandon", "OR"],
  ["Erin Hills", "Erin", "WI"],
  ["Chambers Bay", "University Place", "WA"],
  ["Streamsong Resort Red Course", "Streamsong", "FL"],
  ["Muirfield Village Golf Club", "Dublin", "OH"],
  ["Scioto Country Club", "Columbus", "OH"],
  ["The Ohio State University Scarlet Course", "Columbus", "OH"],
  ["Inverness Club", "Toledo", "OH"],
  ["Aronimink Golf Club", "Newtown Square", "PA"],
  ["Cog Hill Dubsdread No. 4", "Lemont", "IL"],
  ["Brown Deer Park Golf Course", "Milwaukee", "WI"],
  ["Torrey Pines South Course", "La Jolla", "CA"],
  ["Black Mesa Golf Club", "La Mesilla", "NM"],
  ["Airport National Golf Course", "Cedar Rapids", "IA"],
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function search(q, attempt = 1) {
  const url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    });
    const ms = Date.now() - t0;
    if (res.status === 429 && attempt <= 3) {
      await sleep(2000 * attempt);
      return search(q, attempt + 1);
    }
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { ok: true, ms, courses: json.courses || [] };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

function fmt(s, n) { return String(s ?? "").slice(0, n).padEnd(n); }

async function main() {
  console.log(`\nGolfCourseAPI coverage check — ${COURSES.length} courses\n`);
  console.log(fmt("Course", 42) + fmt("ST", 4) + fmt("Hits", 6) + fmt("Tees", 6) + fmt("Top match", 35) + fmt("Has rating?", 12));
  console.log("-".repeat(110));

  let hit = 0, hasFullData = 0, totalLatency = 0;
  for (const [i, [name, city, state]] of COURSES.entries()) {
    if (i > 0) await sleep(1200); // stay under per-minute limits
    const r = await search(name);
    totalLatency += r.ms;
    if (!r.ok) {
      console.log(fmt(name, 42) + fmt(state, 4) + fmt("ERR", 6) + fmt("-", 6) + fmt(r.error, 35) + fmt("-", 12));
      continue;
    }
    // Find best match in the same state
    const stateMatches = r.courses.filter(c => c.location?.state === state);
    const best = stateMatches[0] || r.courses[0];
    if (!best) {
      console.log(fmt(name, 42) + fmt(state, 4) + fmt("0", 6) + fmt("-", 6) + fmt("(no matches)", 35) + fmt("-", 12));
      continue;
    }
    hit++;
    const allTees = [...(best.tees?.male || []), ...(best.tees?.female || [])];
    const hasRating = allTees.some(t => t.course_rating > 0 && t.slope_rating > 0);
    if (hasRating && allTees.some(t => t.holes?.length > 0)) hasFullData++;
    const matchName = `${best.club_name} (${best.location?.city || "?"})`;
    console.log(fmt(name, 42) + fmt(state, 4) + fmt(r.courses.length, 6) + fmt(allTees.length, 6) + fmt(matchName, 35) + fmt(hasRating ? "yes" : "no", 12));
  }

  console.log("-".repeat(110));
  console.log();
  console.log(`Coverage:    ${hit}/${COURSES.length} returned at least one match (${Math.round(hit/COURSES.length*100)}%)`);
  console.log(`Full data:   ${hasFullData}/${COURSES.length} have rating + slope + holes (${Math.round(hasFullData/COURSES.length*100)}%)`);
  console.log(`Avg latency: ${Math.round(totalLatency/COURSES.length)}ms`);
}
main();
