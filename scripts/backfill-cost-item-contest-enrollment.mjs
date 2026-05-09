#!/usr/bin/env node
// Issue #124 — populate `contest_participants` for the new cost-item-driven
// contests (Friday Skins, Thursday CTP Front, etc.) from current
// `user_option_selections`. Idempotent.
//
// For each (user, option) selection, walks:
//   user_option_selections.value
//     → cost_items where linked_option_id = option_id (and choice matches)
//     → contests where buy_in_cost_item_id = cost_item.id
// Upserts contest_participants(contest_id, user_id) for every match.
//
// Run AFTER:
//   - 00142_contests_as_spine.sql
//   - scripts/backfill-contests-as-spine.mjs
//
// Usage: node scripts/backfill-cost-item-contest-enrollment.mjs [--dry-run]

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

function isYesValue(value) {
  if (value === true) return true;
  if (typeof value === "string") return value !== "" && value !== "none";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return value > 0;
  return false;
}

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})\n`);

  // Pull all the parts in parallel.
  const [{ data: items }, { data: contests }, { data: selections }] = await Promise.all([
    admin
      .from("cost_items")
      .select("id, name, linked_option_id, choices:cost_item_option_choices(choice_value)")
      .eq("trip_id", trip.id)
      .not("linked_option_id", "is", null),
    admin
      .from("contests")
      .select("id, name, buy_in_cost_item_id")
      .eq("trip_id", trip.id)
      .not("buy_in_cost_item_id", "is", null),
    admin
      .from("user_option_selections")
      .select("user_id, option_id, value, option:trip_options!inner(trip_id)")
      .eq("option.trip_id", trip.id),
  ]);

  if (!items?.length || !contests?.length || !selections?.length) {
    console.log("Nothing to backfill (missing items/contests/selections).");
    return;
  }

  // Index: option_id → list of cost_items
  const itemsByOption = new Map();
  for (const item of items) {
    if (!itemsByOption.has(item.linked_option_id)) itemsByOption.set(item.linked_option_id, []);
    itemsByOption.get(item.linked_option_id).push(item);
  }
  // Index: cost_item_id → list of contests
  const contestsByItem = new Map();
  for (const c of contests) {
    if (!contestsByItem.has(c.buy_in_cost_item_id)) contestsByItem.set(c.buy_in_cost_item_id, []);
    contestsByItem.get(c.buy_in_cost_item_id).push(c);
  }

  // Pre-load existing contest_participants for the relevant contests so
  // the script can report inserts vs already-enrolled.
  const allContestIds = contests.map((c) => c.id);
  const { data: existing } = await admin
    .from("contest_participants")
    .select("contest_id, user_id")
    .in("contest_id", allContestIds);
  const existingSet = new Set((existing || []).map((p) => `${p.contest_id}|${p.user_id}`));

  const toInsert = []; // { contest_id, user_id, contestName, userId, reason }
  let alreadyEnrolledCount = 0;

  for (const sel of selections) {
    const itemsForOption = itemsByOption.get(sel.option_id);
    if (!itemsForOption) continue;

    for (const item of itemsForOption) {
      const choices = item.choices || [];
      let funds = false;
      if (choices.length === 0) {
        funds = isYesValue(sel.value);
      } else {
        const choiceSet = new Set(choices.map((c) => c.choice_value));
        if (Array.isArray(sel.value)) {
          funds = sel.value.some((v) => typeof v === "string" && choiceSet.has(v));
        } else if (typeof sel.value === "string") {
          funds = choiceSet.has(sel.value);
        } else if (sel.value === true) {
          funds = true;
        }
      }
      if (!funds) continue;

      const contestsForItem = contestsByItem.get(item.id) || [];
      for (const c of contestsForItem) {
        const key = `${c.id}|${sel.user_id}`;
        if (existingSet.has(key)) {
          alreadyEnrolledCount += 1;
          continue;
        }
        toInsert.push({ contest_id: c.id, user_id: sel.user_id, contestName: c.name, costItemName: item.name });
        existingSet.add(key); // dedupe across multiple selections that resolve to the same contest
      }
    }
  }

  // Group by contest for a digestible report.
  const byContest = new Map();
  for (const ins of toInsert) {
    if (!byContest.has(ins.contestName)) byContest.set(ins.contestName, []);
    byContest.get(ins.contestName).push(ins.user_id);
  }

  console.log(`Plan: ${toInsert.length} new enrollments across ${byContest.size} contests`);
  console.log(`      ${alreadyEnrolledCount} already enrolled (skipped)\n`);
  for (const [contestName, users] of [...byContest.entries()].sort()) {
    console.log(`  ${contestName.padEnd(28)} +${users.length} users`);
  }

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  // Batch upsert in chunks of 500 to stay under PostgREST limits.
  const chunks = [];
  for (let i = 0; i < toInsert.length; i += 500) chunks.push(toInsert.slice(i, i + 500));

  let inserted = 0;
  for (const chunk of chunks) {
    const rows = chunk.map((c) => ({ contest_id: c.contest_id, user_id: c.user_id }));
    const { error } = await admin
      .from("contest_participants")
      .upsert(rows, { onConflict: "contest_id,user_id" });
    if (error) throw error;
    inserted += chunk.length;
  }
  console.log(`\nDone. Inserted ${inserted} contest_participants rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
