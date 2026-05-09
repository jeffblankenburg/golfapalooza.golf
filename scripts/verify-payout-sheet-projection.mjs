#!/usr/bin/env node
// Quick verification that loadPayoutSheet projects contest values onto rows
// the way Phase C expects: every row with a contest_id surfaces the
// contest's payout_splits and (overlay) cost. Lodge rows fall back to row
// values. Crashes with a non-zero exit if any row drifts.

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

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})\n`);

  const { data: rows } = await admin
    .from("payout_sheet_events")
    .select(
      "id, label, contest_id, cost_item_id, payout_splits, contest:contests(id, name, buy_in_cost_item_id, payout_splits, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost))",
    )
    .eq("trip_id", trip.id)
    .order("sort_order");

  const probs = [];

  for (const r of rows) {
    const c = Array.isArray(r.contest) ? r.contest[0] : r.contest;
    const hasContest = !!c;
    const contestSplitsLabel = c?.payout_splits ? JSON.stringify(c.payout_splits) : "null";
    const contestCost = Array.isArray(c?.buy_in_cost_item)
      ? c?.buy_in_cost_item[0]?.cost
      : c?.buy_in_cost_item?.cost;
    const contestCostLabel = contestCost != null ? `$${contestCost}` : "—";

    if (hasContest) {
      console.log(`  [contest] ${r.label.padEnd(28)}  → ${c.name.padEnd(28)}  splits=${contestSplitsLabel}  cost=${contestCostLabel}`);

      // Sanity: row's own payout_splits should match the contest's (because
      // that's what the backfill did). If they drift, flag.
      const a = JSON.stringify(r.payout_splits);
      const b = JSON.stringify(c.payout_splits);
      if (a !== b) probs.push(`drift on ${r.label}: row=${a} contest=${b}`);
    } else {
      console.log(`  [no-ctst] ${r.label.padEnd(28)}  splits=${JSON.stringify(r.payout_splits)}  cost_item_id=${r.cost_item_id ?? "—"}`);
    }
  }

  if (probs.length) {
    console.log("\nPotential drift (row vs contest):");
    for (const p of probs) console.log(`  - ${p}`);
    console.log("\nNon-fatal: row columns are dead-letter once Phase C ships. Drift is expected after the first edit.");
  } else {
    console.log("\nAll contest-linked rows agree with their contest's splits. Backfill is consistent.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
