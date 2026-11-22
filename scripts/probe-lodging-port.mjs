#!/usr/bin/env node
// Read-only: inspect v1 room data + the v2 golfapalooza event situation so we can
// write a correct v1 Rooms -> v2 Lodging port. Touches nothing.
//
// Usage: node scripts/probe-lodging-port.mjs

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const line = (s) => console.log(s);

async function main() {
  // v1 facilities
  const { data: facilities } = await admin.from("facilities").select("id, name, sort_order").order("sort_order");
  line(`\n== v1 facilities (${facilities?.length ?? 0}) ==`);
  for (const f of facilities || []) {
    const { count } = await admin.from("rooms").select("id", { count: "exact", head: true }).eq("facility_id", f.id);
    line(`  ${f.name}  (${count ?? 0} rooms)  id=${f.id}`);
  }

  // sample rooms
  const { data: rooms } = await admin.from("rooms").select("room_number, bed_type, showers, smoking, handicapped, pet_friendly").limit(5);
  line(`\n== sample v1 rooms ==`);
  for (const r of rooms || []) line(`  #${r.room_number}  ${r.bed_type}  showers=${r.showers}  smk=${r.smoking}  ada=${r.handicapped}  pet=${r.pet_friendly}`);

  // trip_facilities -> which trips have lodging, joined to trip_settings
  const { data: tf } = await admin.from("trip_facilities").select("trip_id, facility_id");
  const tripIds = [...new Set((tf || []).map((r) => r.trip_id))];
  line(`\n== trips that have facilities linked (${tripIds.length}) ==`);
  const { data: trips } = tripIds.length
    ? await admin.from("trip_settings").select("id, trip_year, trip_name, status").in("id", tripIds)
    : { data: [] };
  for (const t of trips || []) {
    const { count } = await admin.from("room_assignments").select("id", { count: "exact", head: true }).eq("trip_id", t.id);
    const nFac = (tf || []).filter((r) => r.trip_id === t.id).length;
    line(`  ${t.trip_year} "${t.trip_name}" [${t.status}]  ${nFac} facilities, ${count ?? 0} assignments  trip_id=${t.id}`);
  }

  // total assignments
  const { count: totalAssign } = await admin.from("room_assignments").select("id", { count: "exact", head: true });
  line(`\n== total v1 room_assignments: ${totalAssign ?? 0} ==`);

  // v2 org + events
  const { data: org } = await admin.from("v2_organizations").select("id, slug, name").eq("slug", "golfapalooza").maybeSingle();
  line(`\n== v2 org ==`);
  line(`  ${org?.name}  id=${org?.id}`);
  const { data: events } = org
    ? await admin.from("v2_events").select("id, name, year, status, start_date").eq("org_id", org.id).order("start_date", { ascending: false })
    : { data: [] };
  line(`\n== v2_events for golfapalooza (${events?.length ?? 0}) ==`);
  for (const e of events || []) line(`  ${e.year ?? "?"} "${e.name}" [${e.status}]  start=${e.start_date}  id=${e.id}`);

  // do assignment user_ids exist in v2_profiles?
  const { data: sampleAssign } = await admin.from("room_assignments").select("user_id").limit(1000);
  const uids = [...new Set((sampleAssign || []).map((r) => r.user_id))];
  if (uids.length) {
    const { data: prof } = await admin.from("v2_profiles").select("id").in("id", uids);
    const have = new Set((prof || []).map((p) => p.id));
    const missing = uids.filter((u) => !have.has(u));
    line(`\n== assignment users present in v2_profiles: ${uids.length - missing.length}/${uids.length} (missing ${missing.length}) ==`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
