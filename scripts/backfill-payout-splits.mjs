#!/usr/bin/env node
// Issue #125 follow-up — populate payout_splits defaults per winner_source.
// Idempotent: only sets payout_splits when currently null.
//
// Run AFTER migration 00141_payout_splits.sql.
//
// Defaults:
//   scramble_team    → [{place:1, kind:"remainder"}, {place:2, kind:"flat", amount:80}]
//   scramble_skins   → [{place:1, kind:"skins_proportional"}]
//   ctp_front        → [{place:1, kind:"single_winner"}]
//   ctp_back         → [{place:1, kind:"single_winner"}]
//   long_drive       → [{place:1, kind:"single_winner"}]
//   long_putt        → [{place:1, kind:"single_winner"}]
//   hundred_feet     → [{place:1, kind:"single_winner"}]
//   pickem           → null  (split lives in pickem_settings.payout_json)
//   none             → null  (pass-through cash, no payout)
//
// Usage: node scripts/backfill-payout-splits.mjs [--dry-run]

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

const SECOND_PLACE_FLAT_DEFAULT = 80;

function defaultSplitsFor(winnerSource) {
  switch (winnerSource) {
    case "scramble_team":
      return [
        { place: 1, kind: "remainder" },
        { place: 2, kind: "flat", amount: SECOND_PLACE_FLAT_DEFAULT },
      ];
    case "scramble_skins":
      return [{ place: 1, kind: "skins_proportional" }];
    case "ctp_front":
    case "ctp_back":
    case "long_drive":
    case "long_putt":
    case "hundred_feet":
      return [{ place: 1, kind: "single_winner" }];
    case "pickem":
    case "none":
    default:
      return null;
  }
}

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})`);

  const { data: rows } = await admin
    .from("payout_sheet_events")
    .select("id, label, winner_source, payout_splits")
    .eq("trip_id", trip.id);
  if (!rows) throw new Error("No payout_sheet_events rows");

  console.log(`Loaded ${rows.length} rows.\n`);

  const plan = [];
  for (const r of rows) {
    if (r.payout_splits !== null) {
      plan.push({ status: "skip", reason: "already set", row: r });
      continue;
    }
    const splits = defaultSplitsFor(r.winner_source);
    if (splits === null) {
      plan.push({ status: "leave-null", reason: r.winner_source || "(no winner_source)", row: r });
      continue;
    }
    plan.push({ status: "set", splits, row: r });
  }

  console.log("Plan:");
  for (const p of plan) {
    if (p.status === "set") {
      const summary = JSON.stringify(p.splits);
      console.log(`  [set]   ${p.row.label.padEnd(28)} ${(p.row.winner_source || "").padEnd(18)} ${summary}`);
    } else if (p.status === "leave-null") {
      console.log(`  [null]  ${p.row.label.padEnd(28)} ${(p.row.winner_source || "").padEnd(18)} (no payout splits configured)`);
    } else {
      console.log(`  [skip]  ${p.row.label.padEnd(28)} ${p.reason}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  let updated = 0;
  for (const p of plan) {
    if (p.status !== "set") continue;
    const { error } = await admin
      .from("payout_sheet_events")
      .update({ payout_splits: p.splits })
      .eq("id", p.row.id);
    if (error) throw error;
    updated += 1;
  }
  console.log(`\nDone. Updated ${updated} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
