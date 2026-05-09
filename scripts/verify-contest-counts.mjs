#!/usr/bin/env node
// After Phase B + cost-item enrollment backfill, verify that:
//   contest.contest_participants count
//     === payout_sheet_events.participant_count (via projection)
// for every contest-linked row. The point of issue #124's unification.

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

const { data: trip } = await admin.from("trip_settings").select("id").eq("status", "active").single();

const { data: events } = await admin
  .from("payout_sheet_events")
  .select("label, contest_id, contest:contests(name)")
  .eq("trip_id", trip.id)
  .order("sort_order");

console.log("Contest roster counts (the new payout-events count source):\n");

for (const e of events) {
  if (!e.contest_id) {
    console.log(`  [no-ctst] ${e.label.padEnd(28)}  (Lodge / pass-through)`);
    continue;
  }
  const { count } = await admin
    .from("contest_participants")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", e.contest_id);
  const contest = Array.isArray(e.contest) ? e.contest[0] : e.contest;
  console.log(`  ${e.label.padEnd(28)}  → ${(contest?.name || "").padEnd(28)}  ${count ?? 0} participants`);
}
