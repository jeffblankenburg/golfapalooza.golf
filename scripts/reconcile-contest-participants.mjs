#!/usr/bin/env node
// Issue #124 — reconcile `contest_participants` against current option
// selections via the cost_item linkage. For every contest that has a
// `buy_in_cost_item_id`, the desired roster is exactly:
//
//   { users whose current user_option_selections fund that cost_item }
//
// Anyone currently in `contest_participants` who isn't in that set is
// considered stale (they were enrolled via a legacy mechanism but their
// current selection doesn't fund the contest). They get removed.
//
// Anyone in the set but not yet enrolled gets added.
//
// Contests WITHOUT buy_in_cost_item_id are left alone — they're either
// using the legacy `linked_contest_id` mechanism or have no automatic
// funding source (manual rosters, brackets, etc.).
//
// Default mode applies. `--dry-run` reports without writing.
//
// Usage: node scripts/reconcile-contest-participants.mjs [--dry-run]

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

  const [{ data: contests }, { data: items }, { data: users }, { data: selections }] = await Promise.all([
    admin
      .from("contests")
      .select("id, name, buy_in_cost_item_id")
      .eq("trip_id", trip.id)
      .not("buy_in_cost_item_id", "is", null),
    admin
      .from("cost_items")
      .select("id, linked_option_id, choices:cost_item_option_choices(choice_value)")
      .eq("trip_id", trip.id)
      .not("linked_option_id", "is", null),
    admin
      .from("users")
      .select("id, display_name"),
    admin
      .from("user_option_selections")
      .select("user_id, option_id, value, option:trip_options!inner(trip_id)")
      .eq("option.trip_id", trip.id),
  ]);

  if (!contests?.length) {
    console.log("No contests with buy_in_cost_item_id. Nothing to do.");
    return;
  }
  const userName = new Map((users || []).map((u) => [u.id, u.display_name || u.id.slice(0, 8)]));
  const itemById = new Map((items || []).map((i) => [i.id, i]));

  // Group selections by option for fast lookup.
  const selectionsByOption = new Map();
  for (const s of selections || []) {
    if (!selectionsByOption.has(s.option_id)) selectionsByOption.set(s.option_id, []);
    selectionsByOption.get(s.option_id).push(s);
  }

  // Pre-load all current contest_participants so we can compute deltas.
  const contestIds = contests.map((c) => c.id);
  const { data: currentEnrollments } = await admin
    .from("contest_participants")
    .select("contest_id, user_id")
    .in("contest_id", contestIds);
  const currentByContest = new Map();
  for (const e of currentEnrollments || []) {
    if (!currentByContest.has(e.contest_id)) currentByContest.set(e.contest_id, new Set());
    currentByContest.get(e.contest_id).add(e.user_id);
  }

  const plan = []; // { contestName, contestId, toAdd:Set, toRemove:Set, keep:Set, untouched:bool, reason? }

  for (const contest of contests) {
    const item = itemById.get(contest.buy_in_cost_item_id);
    if (!item || !item.linked_option_id) {
      plan.push({
        contestName: contest.name,
        contestId: contest.id,
        untouched: true,
        reason: item ? "cost_item not linked to an option" : "buy_in_cost_item missing/orphan",
      });
      continue;
    }

    const choices = item.choices || [];
    const choiceSet = new Set(choices.map((c) => c.choice_value));
    const optSelections = selectionsByOption.get(item.linked_option_id) || [];

    const desired = new Set();
    for (const sel of optSelections) {
      let funds = false;
      if (choices.length === 0) {
        funds = isYesValue(sel.value);
      } else if (Array.isArray(sel.value)) {
        funds = sel.value.some((v) => typeof v === "string" && choiceSet.has(v));
      } else if (typeof sel.value === "string") {
        funds = choiceSet.has(sel.value);
      } else if (sel.value === true) {
        funds = true;
      }
      if (funds) desired.add(sel.user_id);
    }

    const current = currentByContest.get(contest.id) || new Set();
    const toAdd = new Set([...desired].filter((u) => !current.has(u)));
    const toRemove = new Set([...current].filter((u) => !desired.has(u)));
    const keep = new Set([...current].filter((u) => desired.has(u)));

    plan.push({ contestName: contest.name, contestId: contest.id, toAdd, toRemove, keep, untouched: false });
  }

  console.log("Plan:\n");
  let totalAdds = 0;
  let totalRemoves = 0;
  for (const p of plan.sort((a, b) => a.contestName.localeCompare(b.contestName))) {
    if (p.untouched) {
      console.log(`  [skip]    ${p.contestName.padEnd(28)}  ${p.reason}`);
      continue;
    }
    const a = p.toAdd.size;
    const r = p.toRemove.size;
    const k = p.keep.size;
    totalAdds += a;
    totalRemoves += r;
    if (a === 0 && r === 0) {
      console.log(`  [ok]      ${p.contestName.padEnd(28)}  ${k} kept`);
    } else {
      console.log(`  [diff]    ${p.contestName.padEnd(28)}  ${k} kept · +${a} · -${r}`);
      if (r > 0 && r <= 12) {
        const names = [...p.toRemove].map((u) => userName.get(u) || u.slice(0, 8));
        console.log(`            removing: ${names.join(", ")}`);
      } else if (r > 12) {
        const names = [...p.toRemove].slice(0, 12).map((u) => userName.get(u) || u.slice(0, 8));
        console.log(`            removing: ${names.join(", ")}, …+${r - 12} more`);
      }
      if (a > 0 && a <= 12) {
        const names = [...p.toAdd].map((u) => userName.get(u) || u.slice(0, 8));
        console.log(`            adding:   ${names.join(", ")}`);
      }
    }
  }
  console.log(`\nTotals: +${totalAdds} adds · -${totalRemoves} removes`);

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  // Apply.
  console.log("\nApplying…");
  for (const p of plan) {
    if (p.untouched) continue;
    if (p.toAdd.size > 0) {
      const rows = [...p.toAdd].map((u) => ({ contest_id: p.contestId, user_id: u }));
      const { error } = await admin
        .from("contest_participants")
        .upsert(rows, { onConflict: "contest_id,user_id" });
      if (error) throw error;
    }
    if (p.toRemove.size > 0) {
      const { error } = await admin
        .from("contest_participants")
        .delete()
        .eq("contest_id", p.contestId)
        .in("user_id", [...p.toRemove]);
      if (error) throw error;
    }
  }
  console.log(`\nDone. +${totalAdds} / -${totalRemoves}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
