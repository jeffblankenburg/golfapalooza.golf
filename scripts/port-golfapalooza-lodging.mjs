#!/usr/bin/env node
// Port v1 Rooms data for Golfapalooza into the v2 Lodging schema (migration 00300).
//
// v1 modeled one hotel as 4 "facilities" (floor/wing sections) because v1 rooms had
// no floor field. v2 has one, so we collapse those into ONE property ("Alpine Lake
// Resort", kind=hotel) and carry the wing into each room's `floor` ("1st East").
// 35 rooms + the 43 current-trip assignments land on the single active v2 event.
//
// Idempotent: the property is reused if present, rooms upsert by their preserved v1
// id, and assignments upsert by (event_id, user_id). Safe to re-run.
//
// Usage:
//   node scripts/port-golfapalooza-lodging.mjs --dry-run   # preview, write nothing
//   node scripts/port-golfapalooza-lodging.mjs             # apply

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = (s) => console.log(s);
const die = (s) => { console.error(`\n✗ ${s}`); process.exit(1); };

/** "Alpine Lake Resort, 1st Floor East" -> { hotel: "Alpine Lake Resort", floor: "1st East" } */
function splitFacility(name) {
  const comma = name.indexOf(",");
  const hotel = comma >= 0 ? name.slice(0, comma).trim() : name.trim();
  const wing = comma >= 0 ? name.slice(comma + 1).trim() : "";
  const floor = wing.replace(/\s*Floor\s*/i, " ").replace(/\s+/g, " ").trim() || null;
  return { hotel, floor };
}

async function main() {
  // 0. Confirm the v2 lodging schema exists (migration 00300 must have run).
  const probe = await admin.from("v2_lodging_properties").select("id").limit(1);
  if (probe.error) die(`v2_lodging_properties not reachable — run migration 00300_v2_lodging.sql first.\n   (${probe.error.message})`);

  // 1. Resolve org + the single active event.
  const { data: org } = await admin.from("v2_organizations").select("id, name").eq("slug", "golfapalooza").maybeSingle();
  if (!org) die("No golfapalooza org in v2_organizations.");
  const { data: events } = await admin
    .from("v2_events").select("id, name, status").eq("org_id", org.id).eq("status", "active");
  if (!events || events.length !== 1) die(`Expected exactly 1 active v2 event, found ${events?.length ?? 0}.`);
  const event = events[0];
  log(`Target: ${org.name} / "${event.name}" (event ${event.id})`);

  // 2. Load v1 facilities + their rooms.
  const { data: facilities } = await admin.from("facilities").select("id, name, sort_order").order("sort_order");
  if (!facilities?.length) die("No v1 facilities found.");
  const facById = new Map(facilities.map((f) => [f.id, f]));
  const { hotel } = splitFacility(facilities[0].name);

  const { data: v1rooms } = await admin
    .from("rooms")
    .select("id, facility_id, room_number, bed_type, showers, smoking, handicapped, pet_friendly");
  const scopedRooms = (v1rooms || []).filter((r) => facById.has(r.facility_id));

  // 3. Load v1 assignments for the active trip (the only trip with lodging).
  const { data: tf } = await admin.from("trip_facilities").select("trip_id, facility_id").in("facility_id", [...facById.keys()]);
  const tripIds = [...new Set((tf || []).map((r) => r.trip_id))];
  if (tripIds.length !== 1) log(`  (note: facilities are linked to ${tripIds.length} trips; importing assignments from all of them onto the active event)`);
  const { data: v1assign } = tripIds.length
    ? await admin.from("room_assignments").select("room_id, user_id, trip_id").in("trip_id", tripIds)
    : { data: [] };

  // 3b. One room per person per event (v2 constraint). Dedupe, keeping the last seen.
  const byUser = new Map();
  for (const a of v1assign || []) byUser.set(a.user_id, a.room_id);
  const dupUsers = (v1assign || []).length - byUser.size;
  if (dupUsers > 0) log(`  (note: ${dupUsers} user(s) were in multiple v1 rooms; kept one each per the v2 one-room rule)`);

  // 4. Build the v2 rows.
  const existingProp = await admin
    .from("v2_lodging_properties").select("id").eq("event_id", event.id).eq("name", hotel).maybeSingle();
  const propertyId = existingProp.data?.id || randomUUID();

  const roomRows = scopedRooms.map((r, i) => {
    const fac = facById.get(r.facility_id);
    const { floor } = splitFacility(fac.name);
    const num = parseInt(r.room_number, 10);
    return {
      id: r.id, // preserve v1 room id
      property_id: propertyId,
      org_id: org.id,
      event_id: event.id,
      label: r.room_number,
      floor,
      bed_type: r.bed_type || null,
      bed_count: null,
      capacity: null,
      smoking: !!r.smoking,
      pet_friendly: !!r.pet_friendly,
      accessible: !!r.handicapped,
      private_bath: (r.showers ?? 0) >= 1,
      notes: (r.showers ?? 0) >= 2 ? `${r.showers} showers` : null,
      sort_order: (fac.sort_order ?? 0) * 1000 + (Number.isFinite(num) ? num : i),
    };
  });
  const validRoomIds = new Set(roomRows.map((r) => r.id));
  const assignRows = [...byUser.entries()]
    .filter(([, roomId]) => validRoomIds.has(roomId))
    .map(([userId, roomId]) => ({ room_id: roomId, org_id: org.id, event_id: event.id, user_id: userId }));

  log(`\nPlan:`);
  log(`  property : "${hotel}" (${existingProp.data ? "reuse" : "create"}) id=${propertyId}`);
  log(`  rooms    : ${roomRows.length} (upsert by id)`);
  log(`  assigns  : ${assignRows.length} (upsert by event_id,user_id)`);

  if (DRY_RUN) { log(`\n(dry run — nothing written)`); return; }

  // 5. Apply.
  if (!existingProp.data) {
    const { error } = await admin.from("v2_lodging_properties").insert({
      id: propertyId, org_id: org.id, event_id: event.id, name: hotel, kind: "hotel", sort_order: 0,
    });
    if (error) die(`property insert: ${error.message}`);
  }
  const { error: rErr } = await admin.from("v2_lodging_rooms").upsert(roomRows, { onConflict: "id" });
  if (rErr) die(`rooms upsert: ${rErr.message}`);
  const { error: aErr } = await admin.from("v2_lodging_assignments").upsert(assignRows, { onConflict: "event_id,user_id" });
  if (aErr) die(`assignments upsert: ${aErr.message}`);

  log(`\n✓ Ported ${roomRows.length} rooms + ${assignRows.length} assignments into "${hotel}".`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
