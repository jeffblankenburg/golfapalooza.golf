#!/usr/bin/env node
// Probe the current DB state for the history-import work in issue #114.
// Read-only — never writes.

import { createClient } from "@supabase/supabase-js";
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

console.log("\n=== Courses matching 'alpine' or 'oglebay' ===");
const { data: courses } = await admin
  .from("courses")
  .select("id, name, city, state, source, verified, lookup_key")
  .or("name.ilike.%alpine%,name.ilike.%oglebay%");
console.log(courses);

console.log("\n=== All trip_settings rows ===");
const { data: trips } = await admin
  .from("trip_settings")
  .select("id, trip_name, trip_year, start_date, status, course_id")
  .order("trip_year", { ascending: true });
console.log(trips);

console.log("\n=== Current accolades sample (first 5) ===");
const { data: accolades } = await admin
  .from("accolades")
  .select("id, trip_id, title, user_id, sort_order")
  .limit(5);
console.log(accolades);

console.log("\n=== Users count + columns sample ===");
const { count: userCount } = await admin
  .from("users")
  .select("*", { count: "exact", head: true });
console.log(`Total users: ${userCount}`);

const { data: userSample } = await admin
  .from("users")
  .select("id, display_name, full_name, is_active, is_system, is_financial_only, is_founder")
  .limit(3);
console.log("Sample user shape:", userSample);

console.log("\n=== Course tees + holes for any matched course ===");
if (courses && courses[0]) {
  const courseId = courses[0].id;
  const { data: tees } = await admin
    .from("course_tees")
    .select("id, name, color, course_rating, slope_rating")
    .eq("course_id", courseId);
  console.log("Tees:", tees);
  const { data: holes, count: holeCount } = await admin
    .from("course_holes")
    .select("hole_number, par, handicap_index, yards", { count: "exact" })
    .eq("course_id", courseId)
    .order("hole_number");
  console.log(`Holes (${holeCount}):`, holes);
}
