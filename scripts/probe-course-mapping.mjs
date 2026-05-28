#!/usr/bin/env node
// Quick diagnostic: dump everything about one course's tees + holes + GPS
// coverage so we can tell whether the "Not mapped" badge reflects reality
// or a UI staleness bug.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// .env.local loader (no dotenv dep)
const env = Object.fromEntries(
  readFileSync(resolve(REPO_ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const COURSE_ID = process.argv[2] || "4060dbb2-ef6f-40b8-9903-6c3f66f4ec01";

const { data: course } = await supabase
  .from("courses")
  .select("id, name, club_name, city, state")
  .eq("id", COURSE_ID)
  .maybeSingle();

if (!course) {
  console.log(`❌ No course with id ${COURSE_ID}`);
  process.exit(1);
}

console.log(`\n📍 ${course.name}${course.club_name ? ` @ ${course.club_name}` : ""}`);
console.log(`   ${course.city ?? "?"}, ${course.state ?? "?"}\n`);

const { data: tees } = await supabase
  .from("course_tees")
  .select("id, tee_name, tee_color, course_rating, slope_rating")
  .eq("course_id", COURSE_ID)
  .order("tee_name");

console.log(`Tees on this course: ${tees?.length ?? 0}`);
for (const t of tees ?? []) {
  console.log(`  - ${t.tee_name} (${t.tee_color ?? "-"}) ${t.course_rating}/${t.slope_rating}  [${t.id}]`);
}

const { data: holes } = await supabase
  .from("course_holes")
  .select("id, tee_id, hole_number, par, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude")
  .eq("course_id", COURSE_ID)
  .order("hole_number");

console.log(`\nTotal course_holes rows: ${holes?.length ?? 0}`);
if ((holes?.length ?? 0) === 0) {
  console.log(`\n🚨 No course_holes rows at all. The "Not mapped" gray badge is correct — there's no data to be mapped.`);
  process.exit(0);
}

const byTee = new Map();
for (const h of holes ?? []) {
  if (!byTee.has(h.tee_id)) byTee.set(h.tee_id, []);
  byTee.get(h.tee_id).push(h);
}

console.log(`\nMapped coverage per tee:`);
let courseSet = 0, courseTotal = 0, courseFully = 0;
for (const [teeId, teeHoles] of byTee.entries()) {
  const teeName = (tees ?? []).find((t) => t.id === teeId)?.tee_name ?? "(unknown)";
  let set = 0, total = teeHoles.length * 5, fully = 0;
  for (const h of teeHoles) {
    let s = 0;
    if (h.tee_latitude != null && h.tee_longitude != null) s++;
    if (h.green_latitude != null && h.green_longitude != null) s++;
    if (h.green_front_latitude != null && h.green_front_longitude != null) s++;
    if (h.green_back_latitude != null && h.green_back_longitude != null) s++;
    if (h.drive_latitude != null && h.drive_longitude != null) s++;
    set += s;
    if (s === 5) fully++;
  }
  courseSet += set; courseTotal += total; courseFully += fully;
  console.log(`  - ${teeName}: ${set}/${total} points · ${fully}/${teeHoles.length} holes fully mapped`);
}

console.log(`\n📊 Course totals: ${courseSet}/${courseTotal} points · ${courseFully}/${holes.length} (tee, hole) cells fully mapped`);

if (courseFully === 0 && courseSet === 0) {
  console.log(`\n🟦 Badge should be: amber "0/${holes.length} holes mapped" (NOT gray "Not mapped")`);
} else if (courseFully === holes.length) {
  console.log(`\n🟩 Badge should be: green "✓ Fully mapped"`);
} else {
  console.log(`\n🟨 Badge should be: amber "${courseFully}/${holes.length} holes mapped"`);
}
