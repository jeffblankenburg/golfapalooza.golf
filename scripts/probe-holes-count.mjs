#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const env = Object.fromEntries(
  readFileSync(resolve(REPO_ROOT, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { count } = await supabase.from("course_holes").select("*", { count: "exact", head: true });
console.log("Total course_holes rows in DB:", count);

const COURSE_ID = "4060dbb2-ef6f-40b8-9903-6c3f66f4ec01";
const { data: all } = await supabase.from("course_holes").select("id, course_id");
console.log("Rows returned WITHOUT filter or range:", all?.length);
const forCourse = (all || []).filter(r => r.course_id === COURSE_ID);
console.log(`Rows for Moundsville (${COURSE_ID}) in that batch:`, forCourse.length);

// Now the actual /api/courses/list-style query (selecting the coord columns)
const { data: coordBatch } = await supabase
  .from("course_holes")
  .select("id, course_id, tee_id, hole_number, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude");
console.log("\nWith coord columns selected (mirrors /api/courses/list):", coordBatch?.length);
const forCourseCoord = (coordBatch || []).filter(r => r.course_id === COURSE_ID);
console.log(`Rows for Moundsville in that batch:`, forCourseCoord.length);
