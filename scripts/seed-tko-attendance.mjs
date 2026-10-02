#!/usr/bin/env node
// Mark every active member of the "TKO Trivia" test group as ATTENDING its active
// event. "Attending" = v2_event_participants.likelihood 99 + on_roster true (the
// same thing POST /api/v2/events/[eventId]/rsvp writes). Also mirrors each member
// into the event's managed chat room, matching the RSVP side effect.
//
// Deliberately does NOT write v2_activity rows — 41 identical "Attending" entries
// would just flood the feed with no signal.
//
// Idempotent: upserts on (event_id, user_id) and (room_id, user_id).
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// Usage: node scripts/seed-tko-attendance.mjs [--event <id>] [--dry-run]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const eventArgIdx = process.argv.indexOf("--event");
const EVENT_OVERRIDE = eventArgIdx >= 0 ? process.argv[eventArgIdx + 1] : null;

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_SLUG = "tko-trivia";
const ORG_NAME = "TKO Trivia";
const ATTENDING = 99; // likelihood value the UI labels "Attending"

// 1) Resolve the org.
const { data: org } = await admin
  .from("v2_organizations")
  .select("id, name, slug")
  .or(`slug.eq.${ORG_SLUG},name.eq.${ORG_NAME}`)
  .maybeSingle();
if (!org) {
  console.error(`Couldn't find group "${ORG_SLUG}" / "${ORG_NAME}".`);
  process.exit(1);
}

// 2) Resolve the target event: explicit override, else the active one, else most recent.
let event = null;
if (EVENT_OVERRIDE) {
  const { data } = await admin.from("v2_events").select("id, name, status").eq("id", EVENT_OVERRIDE).maybeSingle();
  event = data;
} else {
  const { data: events } = await admin
    .from("v2_events")
    .select("id, name, status, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });
  event = (events || []).find((e) => e.status === "active") || (events || [])[0] || null;
}
if (!event) {
  console.error("No event found to mark attendance for.");
  process.exit(1);
}
console.log(`Group: ${org.name} (${org.slug})`);
console.log(`Event: ${event.name} [${event.status}] ${event.id}`);

// 3) All active members of the org.
const { data: members } = await admin
  .from("v2_memberships")
  .select("user_id")
  .eq("org_id", org.id)
  .eq("status", "active")
  .is("archived_at", null);
const userIds = [...new Set((members || []).map((m) => m.user_id))];
console.log(`Active members: ${userIds.length}`);

// 4) The event's managed chat room (optional side effect).
const { data: room } = await admin
  .from("v2_chat_rooms")
  .select("id")
  .eq("event_id", event.id)
  .eq("room_kind", "event")
  .maybeSingle();
console.log(room ? `Event chat room: ${room.id}` : "No event chat room (skipping membership sync).");

if (DRY_RUN) {
  console.log(`[dry-run] Would mark ${userIds.length} member(s) Attending (likelihood ${ATTENDING}).`);
  process.exit(0);
}

const now = new Date().toISOString();

// 5) Upsert attendance (batched).
const epRows = userIds.map((uid) => ({
  event_id: event.id,
  org_id: org.id,
  user_id: uid,
  likelihood: ATTENDING,
  on_roster: true,
  likelihood_set_at: now,
  updated_at: now,
}));
const { error: epErr } = await admin
  .from("v2_event_participants")
  .upsert(epRows, { onConflict: "event_id,user_id" });
if (epErr) {
  console.error("Attendance upsert failed:", epErr.message);
  process.exit(1);
}
console.log(`✓ Marked ${epRows.length} member(s) Attending.`);

// 6) Mirror into the event chat room (batched, ignore existing).
if (room) {
  const memRows = userIds.map((uid) => ({ room_id: room.id, user_id: uid, role: "member" }));
  const { error: memErr } = await admin
    .from("v2_chat_room_members")
    .upsert(memRows, { onConflict: "room_id,user_id", ignoreDuplicates: true });
  if (memErr) console.error("  (chat room membership sync failed:", memErr.message + ")");
  else console.log(`✓ Added ${memRows.length} member(s) to the event chat room.`);
}

console.log("\nDone.");
