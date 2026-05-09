#!/usr/bin/env node
// Issue #124 — wipe contest_participants for the active trip and re-derive
// from current user_option_selections, running BOTH sync mechanisms:
//   - legacy `trip_options.linked_contest_id` / `choices[].contest_id`
//     (mirrors src/lib/option-contest-sync.ts → syncContestEnrollment)
//   - new cost_item chain
//     (mirrors src/lib/option-contest-sync.ts → syncCostItemContestEnrollment)
//
// After this runs, contest_participants for every contest in the active
// trip = exactly what option selections currently produce. No legacy
// enrollments survive.
//
// CAUTION: this also clears Calcutta's contest_participants rows (which
// double as auction lots/ownership). On the active dev trip there's no
// Calcutta data, but in production this would be destructive — run with
// `--dry-run` first.
//
// Usage: node scripts/wipe-and-resync-contest-participants.mjs [--dry-run]

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

  const [{ data: contests }, { data: options }, { data: items }, { data: selections }, { data: users }] =
    await Promise.all([
      admin
        .from("contests")
        .select("id, name, contest_type, buy_in_cost_item_id")
        .eq("trip_id", trip.id),
      admin
        .from("trip_options")
        .select("id, name, option_type, linked_contest_id, choices")
        .eq("trip_id", trip.id),
      admin
        .from("cost_items")
        .select("id, linked_option_id, choices:cost_item_option_choices(choice_value)")
        .eq("trip_id", trip.id)
        .not("linked_option_id", "is", null),
      admin
        .from("user_option_selections")
        .select("user_id, option_id, value, option:trip_options!inner(trip_id)")
        .eq("option.trip_id", trip.id),
      admin.from("users").select("id, display_name"),
    ]);

  if (!contests?.length) {
    console.log("No contests for active trip. Nothing to do.");
    return;
  }

  const userName = new Map((users || []).map((u) => [u.id, u.display_name || u.id.slice(0, 8)]));
  const optById = new Map((options || []).map((o) => [o.id, o]));
  const contestIds = contests.map((c) => c.id);

  // Index helpers for the cost-item path.
  const itemsByOption = new Map();
  for (const item of items || []) {
    if (!itemsByOption.has(item.linked_option_id)) itemsByOption.set(item.linked_option_id, []);
    itemsByOption.get(item.linked_option_id).push(item);
  }
  const contestsByItem = new Map();
  for (const c of contests) {
    if (!c.buy_in_cost_item_id) continue;
    if (!contestsByItem.has(c.buy_in_cost_item_id)) contestsByItem.set(c.buy_in_cost_item_id, []);
    contestsByItem.get(c.buy_in_cost_item_id).push(c);
  }

  // Snapshot what's about to be deleted (for the report).
  const { data: currentEnrollments } = await admin
    .from("contest_participants")
    .select("contest_id, user_id")
    .in("contest_id", contestIds);
  const currentByContest = new Map();
  for (const e of currentEnrollments || []) {
    currentByContest.set(e.contest_id, (currentByContest.get(e.contest_id) || 0) + 1);
  }

  // Re-derive: walk selections through both syncs, build the desired set.
  const desired = new Set(); // "contestId|userId"

  for (const sel of selections || []) {
    const opt = optById.get(sel.option_id);
    if (!opt) continue;

    // --- Legacy linked_contest_id sync ---
    let optionFunded = false;
    if (opt.option_type === "checkbox") optionFunded = sel.value === true;
    else if (opt.option_type === "select")
      optionFunded = sel.value !== null && sel.value !== "" && sel.value !== "none";
    else if (opt.option_type === "multi_select")
      optionFunded = Array.isArray(sel.value) && sel.value.length > 0;

    if (opt.linked_contest_id && optionFunded) {
      desired.add(`${opt.linked_contest_id}|${sel.user_id}`);
    }
    if (opt.option_type === "multi_select" && Array.isArray(opt.choices)) {
      const selValues = Array.isArray(sel.value) ? sel.value : [];
      for (const choice of opt.choices) {
        if (choice.contest_id && selValues.includes(choice.value)) {
          desired.add(`${choice.contest_id}|${sel.user_id}`);
        }
      }
    }

    // --- Cost-item chain sync ---
    const itemsForOpt = itemsByOption.get(sel.option_id) || [];
    for (const item of itemsForOpt) {
      const choices = item.choices || [];
      let funds = false;
      if (choices.length === 0) {
        funds = isYesValue(sel.value);
      } else {
        const choiceSet = new Set(choices.map((c) => c.choice_value));
        if (Array.isArray(sel.value)) funds = sel.value.some((v) => typeof v === "string" && choiceSet.has(v));
        else if (typeof sel.value === "string") funds = choiceSet.has(sel.value);
        else if (sel.value === true) funds = true;
      }
      if (!funds) continue;
      const cs = contestsByItem.get(item.id) || [];
      for (const c of cs) desired.add(`${c.id}|${sel.user_id}`);
    }
  }

  const newRows = [...desired].map((key) => {
    const [contest_id, user_id] = key.split("|");
    return { contest_id, user_id };
  });
  const desiredByContest = new Map();
  for (const r of newRows) {
    if (!desiredByContest.has(r.contest_id)) desiredByContest.set(r.contest_id, []);
    desiredByContest.get(r.contest_id).push(r.user_id);
  }

  // Report.
  console.log("Wipe + resync plan:\n");
  console.log("  Contest                       Before → After");
  console.log("  " + "—".repeat(54));
  for (const c of contests.sort((a, b) => a.name.localeCompare(b.name))) {
    const before = currentByContest.get(c.id) || 0;
    const after = (desiredByContest.get(c.id) || []).length;
    if (before === 0 && after === 0) continue;
    const line = `  ${c.name.padEnd(28)}  ${String(before).padStart(3)} → ${String(after).padStart(3)}`;
    console.log(after === before ? line + "  (unchanged)" : line);
    if (after > 0 && after <= 6) {
      const names = (desiredByContest.get(c.id) || []).map((u) => userName.get(u) || u.slice(0, 8));
      console.log(`    after: ${names.join(", ")}`);
    }
  }
  console.log("");
  const totalBefore = [...currentByContest.values()].reduce((a, b) => a + b, 0);
  const totalAfter = newRows.length;
  console.log(`Totals: ${totalBefore} enrollments → ${totalAfter} (delta ${totalAfter - totalBefore})`);

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  console.log("\nApplying…");
  const { error: delErr } = await admin
    .from("contest_participants")
    .delete()
    .in("contest_id", contestIds);
  if (delErr) throw delErr;
  console.log(`  Deleted ${totalBefore} rows.`);

  if (newRows.length > 0) {
    const { error: insErr } = await admin
      .from("contest_participants")
      .upsert(newRows, { onConflict: "contest_id,user_id" });
    if (insErr) throw insErr;
    console.log(`  Inserted ${newRows.length} rows.`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
