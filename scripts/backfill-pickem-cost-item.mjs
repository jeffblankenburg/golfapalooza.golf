#!/usr/bin/env node
// Issue #125 Phase 4 (Workstream A) — defensive backfill.
//
// Ensures every pickem contest in a trip that has cost_items also has its
// `contests.buy_in_cost_item_id` pointing at the matching cost_item (by
// default the row named "Pickem entry"). The earlier
// `backfill-contests-as-spine.mjs` already copied the FK over for the
// active trip, so this script is normally a no-op. It's here so new test
// trips (issue #126 sandbox) and any drift get fixed in one place.
//
// Idempotent: only writes when buy_in_cost_item_id is currently NULL.
// Skips trips that don't have any cost_items (historical archives).
//
// Usage: node scripts/backfill-pickem-cost-item.mjs [--dry-run]

import { createClient } from "@supabase/supabase-js";
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TARGET_COST_ITEM_NAME = "Pickem entry";

async function main() {
  const { data: pickemContests, error } = await admin
    .from("contests")
    .select("id, trip_id, name, buy_in_cost_item_id")
    .eq("contest_type", "pickem");
  if (error) throw error;
  if (!pickemContests || pickemContests.length === 0) {
    console.log("No pickem contests in the database.");
    return;
  }

  const tripIds = Array.from(new Set(pickemContests.map((c) => c.trip_id)));
  const { data: items } = await admin
    .from("cost_items")
    .select("id, trip_id, name, cost")
    .in("trip_id", tripIds)
    .eq("name", TARGET_COST_ITEM_NAME);

  const itemByTrip = new Map((items || []).map((i) => [i.trip_id, i]));

  const plan = [];
  for (const contest of pickemContests) {
    const item = itemByTrip.get(contest.trip_id);
    if (!item) {
      plan.push({ status: "skip", reason: "no Pickem entry cost_item in trip", contest });
      continue;
    }
    if (contest.buy_in_cost_item_id === item.id) {
      plan.push({ status: "ok", reason: "already linked", contest, item });
      continue;
    }
    if (contest.buy_in_cost_item_id) {
      plan.push({ status: "skip", reason: `already linked to a different cost_item (${contest.buy_in_cost_item_id})`, contest });
      continue;
    }
    plan.push({ status: "set", contest, item });
  }

  console.log("Plan:");
  for (const p of plan) {
    if (p.status === "set") {
      console.log(`  [set]   trip=${p.contest.trip_id}  ${p.contest.name.padEnd(20)} → ${p.item.name} ($${p.item.cost})`);
    } else if (p.status === "ok") {
      console.log(`  [ok]    trip=${p.contest.trip_id}  ${p.contest.name.padEnd(20)} → already linked`);
    } else {
      console.log(`  [skip]  trip=${p.contest.trip_id}  ${p.contest.name.padEnd(20)} — ${p.reason}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  let updated = 0;
  for (const p of plan) {
    if (p.status !== "set") continue;
    const { error: upErr } = await admin
      .from("contests")
      .update({ buy_in_cost_item_id: p.item.id })
      .eq("id", p.contest.id);
    if (upErr) throw upErr;
    updated += 1;
  }
  console.log(`\nDone. Updated ${updated} pickem contest(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
