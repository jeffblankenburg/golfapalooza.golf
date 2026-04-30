#!/usr/bin/env node
// Seed trip_settings rows for every historical Golfapalooza (1997-2024)
// using the generation names from `Golfapalooza History.xlsx` Awards sheet.
// Idempotent — re-running only fills in missing years.
//
// Phase 1a of issue #114. Run AFTER migration 00119_history_accolades.sql.
//
// Usage: node scripts/seed-historical-trips.mjs [--dry-run]

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const WORKBOOK = resolve(REPO_ROOT, "Golfapalooza History.xlsx");
const ALPINE_LAKE_COURSE_ID = "6a406043-79b2-43b9-a284-bb406beb1dbe";
const DRY_RUN = process.argv.includes("--dry-run");

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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 1. Pull (year → generation) from Awards sheet, prefer first row per year
//    (handles the 2015 duplicate row), and patch the workbook's GVII typo
//    on 2004 to GVIII so 2003/2004 don't share a generation name.
const wb = XLSX.read(readFileSync(WORKBOOK), { type: "buffer", cellDates: true });
const awardsRows = XLSX.utils.sheet_to_json(wb.Sheets["Awards"], {
  header: 1,
  raw: false,
  defval: null,
});

const generations = new Map();
for (const row of awardsRows.slice(1)) {
  if (!row || row.length < 2) continue;
  const yearStr = row[0];
  const gen = row[1];
  if (!yearStr || !gen) continue;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) continue;
  if (!generations.has(year)) generations.set(year, gen);
}
if (generations.get(2004) === "GVII") {
  generations.set(2004, "GVIII");
  console.log("Patched 2004 generation: GVII → GVIII (workbook typo)");
}

// 2. Decide which years to seed: every historical year 1997-2024.
//    Leave existing 2025/2026 rows alone (verified during planning).
const HISTORICAL_YEARS = [];
for (let y = 1997; y <= 2024; y++) HISTORICAL_YEARS.push(y);

const { data: existingTrips, error: existingErr } = await admin
  .from("trip_settings")
  .select("id, trip_year, trip_name, status, course_id")
  .order("trip_year");
if (existingErr) {
  console.error("Failed to read trip_settings:", existingErr.message);
  process.exit(1);
}
const existingYears = new Set(existingTrips.map((t) => t.trip_year));
console.log("Existing trip years:", [...existingYears].sort());

// 3. Compose the seed payload. Approximate start_date as Aug 30 of each year
//    (Golfapalooza runs Labor Day weekend; admin can correct via UI later).
const toSeed = [];
for (const year of HISTORICAL_YEARS) {
  if (existingYears.has(year)) {
    console.log(`Skipping ${year} — trip_settings row already exists`);
    continue;
  }
  const generation = generations.get(year);
  if (!generation) {
    console.warn(`No generation for ${year} — skipping`);
    continue;
  }
  // Strip the leading 'G' from `GXIV` to match the existing 2025/2026
  // trip_name convention `Golfapalooza XXVIIII`/`Golfapalooza XXX`.
  const numeral = generation.startsWith("G") ? generation.slice(1) : generation;
  toSeed.push({
    trip_name: `Golfapalooza ${numeral}`,
    trip_year: year,
    start_date: `${year}-08-30`,
    status: "archived",
    course_id: ALPINE_LAKE_COURSE_ID,
  });
}

console.log(`\n${toSeed.length} historical trip rows to seed:`);
for (const t of toSeed) console.log(`  ${t.trip_year}  ${t.trip_name}`);

if (DRY_RUN) {
  console.log("\n--dry-run set, not writing. Done.");
  process.exit(0);
}
if (toSeed.length === 0) {
  console.log("\nAll historical trips already seeded. Done.");
  process.exit(0);
}

const { data: inserted, error: insertErr } = await admin
  .from("trip_settings")
  .insert(toSeed)
  .select("id, trip_year, trip_name");
if (insertErr) {
  console.error("Insert failed:", insertErr.message);
  process.exit(1);
}
console.log(`\n✓ Inserted ${inserted.length} trip_settings rows.`);
