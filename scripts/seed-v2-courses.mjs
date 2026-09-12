// One-off: copy the original course library into the universal v2 tables,
// id-preserving + idempotent. Equivalent to migration 00210 but run via the
// service-role REST client (bypasses RLS). Safe to re-run.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function readAll(table, cols) {
  const out = [];
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + size - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < size) return out;
    from += size;
  }
}

async function insertAll(table, rows) {
  const size = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await db.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    done += batch.length;
  }
  return done;
}

const COURSE_COLS =
  "id, external_id, name, club_name, address, city, state, country, postal_code, phone, website, latitude, longitude, hole_count, source, verified, verified_at, lookup_key, created_at, updated_at";
const TEE_COLS =
  "id, course_id, tee_name, tee_color, gender, course_rating, slope_rating, front_nine_rating, front_nine_slope, back_nine_rating, back_nine_slope, total_yards, total_meters, par, confidence, created_at, updated_at";
const HOLE_COLS =
  "id, course_id, tee_id, hole_number, par, handicap_index, yards, meters, hole_name, overhead_image_url, green_image_url, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude, center_line, created_at";

const courses = await readAll("courses", COURSE_COLS);
console.log(`courses read: ${courses.length}, inserted: ${await insertAll("v2_courses", courses)}`);
const tees = await readAll("course_tees", TEE_COLS);
// The original tolerates the odd duplicate (course_id, tee_name); v2 enforces it
// UNIQUE. Disambiguate collisions with a numeric suffix (ids + holes unchanged).
const teeSeen = new Map();
let renamed = 0;
for (const t of tees) {
  const base = t.tee_name;
  let name = base;
  let n = 1;
  while (teeSeen.has(`${t.course_id}|${name.toLowerCase()}`)) { n += 1; name = `${base} ${n}`; renamed += 1; }
  teeSeen.set(`${t.course_id}|${name.toLowerCase()}`, true);
  t.tee_name = name;
}
console.log(`tees read: ${tees.length} (renamed ${renamed}), inserted: ${await insertAll("v2_course_tees", tees)}`);
const holes = await readAll("course_holes", HOLE_COLS);
console.log(`holes read: ${holes.length}, inserted: ${await insertAll("v2_course_holes", holes)}`);

// Hybrid ("composition") tee mappings — the per-hole source-tee pointers. Tee ids
// were preserved above, so these FKs resolve. Without these, hybrid tees look
// like plain tees with their own (placeholder) hole data.
const comp = await readAll("composition_tee_mappings", "id, tee_id, hole_number, source_tee_id, created_at");
console.log(`composition mappings read: ${comp.length}, inserted: ${await insertAll("v2_composition_tee_mappings", comp)}`);
console.log("done");
