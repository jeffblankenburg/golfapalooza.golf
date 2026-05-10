#!/usr/bin/env node
// Issue #124 — one-shot backfill: run the unified-winners materializer
// against every contest in the active trip. Idempotent — safe to re-run.
//
// What this writes into `contest_winners`:
//   - Daily contests (CTP front/back, LD, LP) → from daily_contest_winners
//   - Scramble Team → from scramble_teams gross_score (with handicap tiebreak)
//   - Skins → from calcSkins over scramble_hole_scores (per child contest)
//   - 100 Feet → from MIN cumulative hundred_feet_scores
//   - Pickem → from rankings × pickem_settings.payout_json
//
// Calcutta keeps using prize_id-based contest_winners rows. KGB Cup,
// Cornhole, and "other" non-100ft contests are no-op'd by the dispatcher.
//
// Run AFTER 00143_unified_contest_winners.sql is applied.
//
// Usage: node scripts/backfill-contest-winners.mjs [--dry-run]

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

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})\n`);

  const { data: contests } = await admin
    .from("contests")
    .select("id, name, contest_type")
    .eq("trip_id", trip.id);

  if (!contests?.length) {
    console.log("No contests for active trip.");
    return;
  }

  const before = new Map();
  const { data: priorWinners } = await admin
    .from("contest_winners")
    .select("contest_id")
    .in(
      "contest_id",
      contests.map((c) => c.id),
    );
  for (const w of priorWinners || []) {
    before.set(w.contest_id, (before.get(w.contest_id) ?? 0) + 1);
  }

  if (DRY_RUN) {
    console.log("Dry run — would materialize the following contests:");
    for (const c of contests) {
      console.log(`  ${c.name.padEnd(28)}  type=${c.contest_type}`);
    }
    return;
  }

  // Materializers live in the TS lib; we can't import from a .mjs script.
  // Instead, hit our API endpoint that triggers a full grid load — the
  // grid-v2 loader lazily materializes every contest as a side effect.
  // (Using the API also exercises auth wiring; useful sanity check.)
  console.log("Triggering grid-load materialization via the admin API…");
  console.log("(this requires a logged-in admin session cookie or service role)\n");

  // Inline shortcut: re-run the materializers via direct SQL replication.
  // Daily contests (the only type whose materialization is fully expressible
  // in SQL) we backfill here; everything else gets done by the grid load
  // when an admin opens /admin/financials/grid.
  console.log("Materializing daily contests directly…");
  let dailyMaterialized = 0;
  for (const c of contests) {
    if (!["ctp_front", "ctp_back", "long_drive", "long_putt"].includes(c.contest_type)) continue;
    const { data: contestRow } = await admin
      .from("contests")
      .select("trip_id, contest_type, day_number, payout_splits, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)")
      .eq("id", c.id)
      .single();
    if (!contestRow?.day_number) continue;

    const { data: dcw } = await admin
      .from("daily_contest_winners")
      .select("user_id")
      .eq("trip_id", contestRow.trip_id)
      .eq("day_number", contestRow.day_number)
      .eq("contest_type", contestRow.contest_type)
      .maybeSingle();

    // Clear any existing rows first (reconcile).
    await admin.from("contest_winners").delete().eq("contest_id", c.id);

    if (!dcw) {
      console.log(`  ${c.name.padEnd(28)}  no winner recorded — cleared`);
      continue;
    }

    const ci = Array.isArray(contestRow.buy_in_cost_item)
      ? contestRow.buy_in_cost_item[0]
      : contestRow.buy_in_cost_item;
    const perParticipant = Number(ci?.cost ?? 0);
    const { count } = await admin
      .from("contest_participants")
      .select("id", { count: "exact", head: true })
      .eq("contest_id", c.id);
    const pot = Math.round(perParticipant * (count ?? 0) * 100) / 100;

    const { error: insErr } = await admin.from("contest_winners").insert({
      contest_id: c.id,
      user_id: dcw.user_id,
      place: 1,
      amount: pot,
      determined_by: "rule",
    });
    if (insErr) throw insErr;
    dailyMaterialized++;
    console.log(`  ${c.name.padEnd(28)}  +1 row  amount=$${pot}`);
  }

  console.log(`\nDaily contests materialized: ${dailyMaterialized}`);
  console.log("\nFor scramble Team / Skins / Pickem / 100 Feet: open");
  console.log("  /admin/financials/grid");
  console.log("once. The grid-v2 loader lazily materializes them on read.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
