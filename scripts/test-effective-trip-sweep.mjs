#!/usr/bin/env node
// Static-analysis verification that the issue #126 sweep landed cleanly.
//
// What this checks across every server-side file in src/:
//   1. No file still uses `.eq("status", "active")` for trip_settings
//      lookups (except the one in src/lib/simulator.ts which IS the
//      fallback resolver).
//   2. Every file that uses `(await getEffectiveTripId())!` also imports
//      `getEffectiveTripId` from "@/lib/simulator". If it uses the helper
//      without importing it, the import is broken.
//   3. The simulator module exports `getEffectiveTripId`, `getSimTripId`,
//      and `isSimulatingTrip` — the public surface the rest of the
//      codebase depends on.
//   4. The simulator module does NOT import itself (would be infinite
//      recursion — exactly the bug we hit during the sweep).
//
// Run: node scripts/test-effective-trip-sweep.mjs
// Exit code: 0 if everything checks out, 1 otherwise.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

const failures = [];

function walk(dir, hits = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, hits);
    } else if (
      st.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx"))
    ) {
      hits.push(full);
    }
  }
  return hits;
}

const files = walk(SRC);

// ── Check 1: no stray `.eq("status", "active")` on trip_settings ────
const STATUS_RE = /\.eq\(\s*"status"\s*,\s*"active"\s*\)/;
const ALLOWED_ACTIVE_LOOKUPS = new Set([
  "src/lib/simulator.ts",                          // the fallback resolver itself
  "src/lib/sim/scaffold.ts",                       // copies the REAL active trip's course to seed the test event
  "src/app/api/admin/simulator/route.ts",          // resolves the REAL active trip to clone from when creating/syncing the test event
  "src/app/api/admin/trips/duplicate/route.ts",    // archives the existing active event when duplicating into a new active one
]);
for (const file of files) {
  const rel = relative(ROOT, file);
  if (ALLOWED_ACTIVE_LOOKUPS.has(rel)) continue;

  const src = readFileSync(file, "utf-8");
  if (STATUS_RE.test(src)) {
    failures.push(
      `[check 1] ${rel} still has \`.eq("status", "active")\` (sweep missed it)`,
    );
  }
}

// ── Check 2: files using the helper must import it ─────────────────
const HELPER_USAGE_RE = /\(\s*await\s+getEffectiveTripId\(\s*\)\s*\)\s*!/;
const HELPER_IMPORT_RE =
  /import\s*\{[^}]*\bgetEffectiveTripId\b[^}]*\}\s*from\s*["']@\/lib\/simulator["']/;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === "src/lib/simulator.ts") continue;

  const src = readFileSync(file, "utf-8");
  const usesHelper =
    HELPER_USAGE_RE.test(src) || /\bgetEffectiveTripId\(\)/.test(src);
  if (!usesHelper) continue;

  if (!HELPER_IMPORT_RE.test(src)) {
    failures.push(
      `[check 2] ${rel} uses getEffectiveTripId() without importing it`,
    );
  }
}

// ── Check 3: simulator exports the public surface ──────────────────
const simSrc = readFileSync(join(SRC, "lib/simulator.ts"), "utf-8");
const required = ["getEffectiveTripId", "getSimTripId", "isSimulatingTrip"];
for (const sym of required) {
  if (!new RegExp(`export\\s+(const|async\\s+function|function)\\s+${sym}\\b`).test(simSrc)) {
    failures.push(`[check 3] src/lib/simulator.ts does not export ${sym}`);
  }
}

// ── Check 4: simulator does not import itself ──────────────────────
if (/from\s+["']@\/lib\/simulator["']/.test(simSrc)) {
  failures.push(
    `[check 4] src/lib/simulator.ts imports from itself — would cause infinite recursion`,
  );
}

// ── Check 5: the sweep's expected file count ───────────────────────
// We grep-counted 58 files before the sweep. After: simulator.ts retains
// one `.eq("status", "active")` as the fallback; every other status=active
// trip lookup should be gone. So we expect:
//   - 1 file in src/ still containing `.eq("status", "active")` for the
//     trip_settings table (simulator.ts itself).
let remainingTripActive = 0;
for (const file of files) {
  const src = readFileSync(file, "utf-8");
  // Only count occurrences within ~5 lines of a `from("trip_settings")`
  // — the `.in("status", ...)` queries on polls/announcements aren't
  // what we care about.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (STATUS_RE.test(lines[i])) {
      // Look up 8 lines for a trip_settings reference.
      const window = lines.slice(Math.max(0, i - 8), i).join("\n");
      if (/from\s*\(\s*["']trip_settings["']\s*\)/.test(window)) {
        remainingTripActive += 1;
      }
    }
  }
}
// Expect 4: simulator.ts (fallback) + scaffold.ts (real-trip course copy)
// + admin/simulator/route.ts (real-trip clone source) + admin/trips/duplicate
// (archives existing active when promoting a duplicate).
if (remainingTripActive !== 4) {
  failures.push(
    `[check 5] Expected exactly 4 remaining \`.eq("status", "active")\` on trip_settings (simulator + scaffold + sim-route + duplicate-route), found ${remainingTripActive}`,
  );
}

// ── Report ─────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(`✅ All checks passed. Sweep landed cleanly across ${files.length} source files.`);
  console.log(`   - No stray .eq("status", "active") on trip_settings`);
  console.log(`   - Every getEffectiveTripId() usage imports the helper`);
  console.log(`   - Simulator exports getEffectiveTripId, getSimTripId, isSimulatingTrip`);
  console.log(`   - Simulator does not import itself`);
  console.log(`   - Exactly 4 allowed trip_settings status=active queries (fallback + scaffold + sim-route + duplicate-route)`);
  process.exit(0);
}

console.error(`❌ ${failures.length} failure(s):\n`);
for (const f of failures) console.error("  " + f);
process.exit(1);
