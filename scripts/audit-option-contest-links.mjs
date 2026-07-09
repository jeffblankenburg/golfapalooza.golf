#!/usr/bin/env node
// Audit + repair option -> contest linkages (Phase 1 of issue #137).
//
// Walks every PAID trip_option on the active + test trips and reports which
// ones don't resolve to a contest through ANY of the three linkage paths:
//   1. trip_options.linked_contest_id                (legacy direct link)
//   2. trip_options.choices[].contest_id             (per-choice link)
//   3. cost_items.linked_option_id -> contests.buy_in_cost_item_id  (#125 chain)
//
// A paid option with no contest link means "check the box, pay the money,
// but never land on the bracket" — exactly the missed-roster bug in #137.
//
// Read-only by default. Pass --apply to patch high-confidence name matches
// (option name ~ contest name) by setting linked_contest_id, then backfill
// contest_participants for everyone already opted in.
//
// Usage:
//   node scripts/audit-option-contest-links.mjs            # report only
//   node scripts/audit-option-contest-links.mjs --apply    # patch + backfill

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const APPLY = process.argv.includes("--apply");

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

// Normalize a name for fuzzy matching: lowercase, strip non-alphanumerics.
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// `trip_options.cost` was dropped post-#125 — an option's money now lives on
// linked cost_items (or, legacy, on choices[].cost). "Paid" = either exists.
function optionIsPaid(option, costItemsByOption) {
  const choices = Array.isArray(option.choices) ? option.choices : [];
  if (choices.some((c) => c.cost != null && Number(c.cost) > 0)) return true;
  const items = costItemsByOption.get(option.id) || [];
  if (items.some((i) => i.cost != null && Number(i.cost) > 0)) return true;
  return false;
}

// A free opt-in can still owe a contest link (e.g. the Yes/No Cornhole
// Tournament selects). Flag any option whose name fully contains a contest's
// name — "Cornhole Singles Tournament" ⊇ "Cornhole Singles" — since that's a
// strong signal it should enroll. The ⊇ direction avoids matching the
// logistics-only "Cornhole Boards & Bags" against those contests.
function nameMatchedContest(option, contests) {
  const optN = norm(option.name);
  return contests.find((c) => {
    const cN = norm(c.name);
    return cN.length > 0 && (cN === optN || optN.includes(cN));
  });
}

// Does this option resolve to at least one contest via any of the 3 paths?
function resolveContests(option, costItemsByOption, contestByCostItem) {
  const ids = new Set();
  if (option.linked_contest_id) ids.add(option.linked_contest_id);
  const choices = Array.isArray(option.choices) ? option.choices : [];
  for (const c of choices) if (c.contest_id) ids.add(c.contest_id);
  for (const item of costItemsByOption.get(option.id) || []) {
    const cid = contestByCostItem.get(item.id);
    if (cid) ids.add(cid);
  }
  return ids;
}

async function main() {
  const { data: trips, error: tripErr } = await admin
    .from("trip_settings")
    .select("id, trip_name, trip_year, status")
    .in("status", ["active", "test"]);
  if (tripErr) throw tripErr;
  if (!trips || trips.length === 0) {
    console.log("No active/test trips found.");
    return;
  }

  let totalUnlinked = 0;

  for (const trip of trips) {
    console.log(`\n=== ${trip.trip_name || ""} ${trip.trip_year || ""} (${trip.status}) ===`);

    const [optRes, contestRes, costRes] = await Promise.all([
      admin
        .from("trip_options")
        .select("id, name, option_type, choices, linked_contest_id")
        .eq("trip_id", trip.id),
      admin
        .from("contests")
        .select("id, name, contest_type, buy_in_cost_item_id")
        .eq("trip_id", trip.id),
      admin
        .from("cost_items")
        .select("id, name, cost, linked_option_id")
        .eq("trip_id", trip.id),
    ]);
    // Surface query errors instead of silently reporting "0 unlinked".
    for (const [label, res] of [["trip_options", optRes], ["contests", contestRes], ["cost_items", costRes]]) {
      if (res.error) throw new Error(`${label} query failed: ${res.error.message}`);
    }
    const options = optRes.data;
    const contests = contestRes.data;
    const costItems = costRes.data;

    const costItemsByOption = new Map();
    for (const item of costItems || []) {
      if (!item.linked_option_id) continue;
      if (!costItemsByOption.has(item.linked_option_id)) costItemsByOption.set(item.linked_option_id, []);
      costItemsByOption.get(item.linked_option_id).push(item);
    }
    const contestByCostItem = new Map();
    const contestById = new Map();
    for (const c of contests || []) {
      contestById.set(c.id, c);
      if (c.buy_in_cost_item_id) contestByCostItem.set(c.buy_in_cost_item_id, c.id);
    }

    // An option "owes" a contest link if it's paid OR its name contains a
    // contest's name (a free Yes/No opt-in like the Cornhole Tournaments).
    const auditable = (options || []).filter(
      (o) => optionIsPaid(o, costItemsByOption) || nameMatchedContest(o, contests || []),
    );
    const unlinked = [];
    let staleCount = 0;

    for (const opt of auditable) {
      const resolved = resolveContests(opt, costItemsByOption, contestByCostItem);
      // Stale: linked_contest_id points at a contest that no longer exists on this trip.
      if (opt.linked_contest_id && !contestById.has(opt.linked_contest_id)) {
        staleCount++;
        console.log(`  ⚠ STALE  "${opt.name}" → linked_contest_id ${opt.linked_contest_id} not on this trip`);
      }
      const liveResolved = [...resolved].filter((id) => contestById.has(id));
      if (liveResolved.length === 0) unlinked.push(opt);
    }

    console.log(`  ${auditable.length} contest-bearing option(s), ${unlinked.length} with no live contest link, ${staleCount} stale.`);
    totalUnlinked += unlinked.length;

    for (const opt of unlinked) {
      const suggestion = nameMatchedContest(opt, contests || []);
      const paid = optionIsPaid(opt, costItemsByOption) ? "$" : "free";
      const hint = suggestion ? ` → suggest "${suggestion.name}" (${suggestion.contest_type})` : " → no name match";
      console.log(`  ✘ UNLINKED "${opt.name}" [${opt.option_type}, ${paid}]${hint}`);

      if (APPLY && suggestion) {
        await applyLink(trip.id, opt, suggestion, contestByCostItem);
      }
    }
  }

  console.log(`\nTotal unlinked contest-bearing options across active/test trips: ${totalUnlinked}`);
  if (!APPLY && totalUnlinked > 0) {
    console.log("Re-run with --apply to patch high-confidence name matches and backfill rosters.");
  }
}

// Negative choice values that mean "opted out" on a Yes/No-style select.
const NEGATIVE_VALUES = new Set(["no", "none", "false", "0", "n", "off", ""]);

// Which choice values on this option are affirmative (enrolling)?
// Everything that isn't an explicit negative token.
function affirmativeValues(option) {
  const choices = Array.isArray(option.choices) ? option.choices : [];
  return new Set(
    choices.map((c) => String(c.value)).filter((v) => !NEGATIVE_VALUES.has(v.toLowerCase())),
  );
}

// Link the affirmative choice(s) to the contest and backfill only the users
// who picked an affirmative value — so a "No" voter is never enrolled.
//
// We set contest_id ON THE CHOICE (not linked_contest_id) so runtime
// `syncContestEnrollment` — once its select branch honors per-choice
// contest_id — mirrors this exactly. Setting linked_contest_id alone would
// enroll "No" voters, because that branch treats any non-empty value as yes.
async function applyLink(tripId, option, contest, contestByCostItem) {
  const affirmative = affirmativeValues(option);
  const choices = Array.isArray(option.choices) ? option.choices : [];

  if (choices.length === 0 || affirmative.size === 0) {
    // No choices to tag (bare select/checkbox) — safe to use linked_contest_id.
    const { error } = await admin
      .from("trip_options")
      .update({ linked_contest_id: contest.id })
      .eq("id", option.id);
    if (error) { console.log(`      ! failed to link: ${error.message}`); return; }
  } else {
    const newChoices = choices.map((c) =>
      affirmative.has(String(c.value)) ? { ...c, contest_id: contest.id } : c,
    );
    const { error } = await admin
      .from("trip_options")
      .update({ choices: newChoices })
      .eq("id", option.id);
    if (error) { console.log(`      ! failed to tag choices: ${error.message}`); return; }
  }

  const { data: selections } = await admin
    .from("user_option_selections")
    .select("user_id, value")
    .eq("option_id", option.id);

  const enrollUsers = (selections || [])
    .filter((s) => isAffirmative(s.value, affirmative, choices.length > 0))
    .map((s) => s.user_id);

  if (enrollUsers.length > 0) {
    const { error: insErr } = await admin
      .from("contest_participants")
      .upsert(
        enrollUsers.map((uid) => ({ contest_id: contest.id, user_id: uid })),
        { onConflict: "contest_id,user_id", ignoreDuplicates: true },
      );
    if (insErr) { console.log(`      ! linked but backfill failed: ${insErr.message}`); return; }
  }
  console.log(`      ✔ linked to "${contest.name}", backfilled ${enrollUsers.length} participant(s)`);
}

// Does a stored selection value enroll? For choice-bearing options, only
// affirmative choice values count (excludes "No"); otherwise any truthy value.
function isAffirmative(value, affirmative, hasChoices) {
  if (hasChoices) {
    if (typeof value === "string") return affirmative.has(value);
    if (Array.isArray(value)) return value.some((v) => affirmative.has(String(v)));
    return false;
  }
  return isYes(value);
}

function isYes(value) {
  if (value === true) return true;
  if (typeof value === "string") return !NEGATIVE_VALUES.has(value.toLowerCase());
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "number") return value > 0;
  return false;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
