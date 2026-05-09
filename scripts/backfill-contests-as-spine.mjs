#!/usr/bin/env node
// Issue #124 Phase B — wire payout_sheet_events to contests.
//
// For each payout_sheet_events row:
//   1. Find or create a matching contests row (per-day Skins/CTP/LD/LP get
//      created; Team/100 Feet/PickEm/KGB Cup are matched to existing rows;
//      Lodge rows are skipped because they're pass-through cash).
//   2. Copy event.cost_item_id   → contest.buy_in_cost_item_id
//   3. Copy event.payout_splits  → contest.payout_splits
//   4. Set Skins contests' parent_contest_id to their day's Scramble Team.
//   5. Set payout_sheet_events.contest_id to the matched contest.
//
// Idempotent. Run AFTER migration 00142_contests_as_spine.sql.
//
// Usage: node scripts/backfill-contests-as-spine.mjs [--dry-run]

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

const DAY_LABEL = { 2: "Thursday", 3: "Friday", 4: "Saturday" };

// suffix on the payout-sheet label  →  per-day contest spec
// `existingScrambleType` means: do not create — match the row that migration
// 00016 already inserted as `Scramble Day N`.
const DAY_TEMPLATES = [
  { eventSuffix: "Team",       contestType: "scramble",        nameSuffix: null,         existingScrambleType: true,  parentSuffix: null },
  { eventSuffix: "Skins",      contestType: "scramble_skins",  nameSuffix: "Skins",      existingScrambleType: false, parentSuffix: "Team" },
  { eventSuffix: "CTP Front",  contestType: "ctp_front",       nameSuffix: "CTP Front",  existingScrambleType: false, parentSuffix: null },
  { eventSuffix: "CTP Back",   contestType: "ctp_back",        nameSuffix: "CTP Back",   existingScrambleType: false, parentSuffix: null },
  { eventSuffix: "Long Drive", contestType: "long_drive",      nameSuffix: "Long Drive", existingScrambleType: false, parentSuffix: null },
  { eventSuffix: "Long Putt",  contestType: "long_putt",       nameSuffix: "Long Putt",  existingScrambleType: false, parentSuffix: null },
];

// Standalone (not per-day) payout rows mapped to existing contests by name.
const STANDALONE_LINKS = [
  { eventLabel: "100 Feet", contestName: "100 Feet!" },
  { eventLabel: "PickEm",   contestName: "Whitey's Pick'em" },
  { eventLabel: "KGB Cup",  contestName: "KGB Cup" },
];

// Pass-through cash; leave payout_sheet_events.contest_id NULL.
const SKIP_LABELS = new Set(["Lodge Mon", "Lodge Tue"]);

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})\n`);

  const [{ data: events }, { data: contests }] = await Promise.all([
    admin
      .from("payout_sheet_events")
      .select("id, label, cost_item_id, payout_splits, contest_id, winner_source, winner_day_number, sort_order")
      .eq("trip_id", trip.id)
      .order("sort_order"),
    admin
      .from("contests")
      .select("id, name, contest_type, day_number, buy_in_cost_item_id, payout_splits, parent_contest_id")
      .eq("trip_id", trip.id),
  ]);

  if (!events || !contests) throw new Error("Failed to load events/contests");

  const contestById = new Map(contests.map((c) => [c.id, c]));
  const contestByName = new Map(contests.map((c) => [c.name, c]));
  const scrambleByDay = new Map(
    contests.filter((c) => c.contest_type === "scramble" && c.day_number != null).map((c) => [c.day_number, c]),
  );

  // Plan items:
  //   { kind: "create-contest", name, contest_type, day_number, buy_in_cost_item_id, payout_splits, parentKey? }
  //   { kind: "update-contest", contestId, current, desired:{ buy_in_cost_item_id?, payout_splits?, parent_contest_id? } }
  //   { kind: "link-event",     eventId, eventLabel, contestId, contestName }
  //   { kind: "skip-event",     eventId, eventLabel, reason }
  const plan = [];

  // We may need to reference contests we just queued for creation. Track
  // them by a synthetic key (e.g. "Thursday Skins") so the second pass
  // (update/link) can reference them.
  const pendingByKey = new Map(); // key -> { contestType, day_number, name, parentKey, buy_in_cost_item_id, payout_splits, eventId }

  function dayPrefixFor(label) {
    for (const [day, prefix] of Object.entries(DAY_LABEL)) {
      if (label.startsWith(prefix + " ")) return Number(day);
    }
    return null;
  }
  function suffixFor(label) {
    for (const prefix of Object.values(DAY_LABEL)) {
      if (label.startsWith(prefix + " ")) return label.slice(prefix.length + 1);
    }
    return null;
  }

  // Pass 1 — figure out the desired contest for each event row.
  for (const ev of events) {
    if (SKIP_LABELS.has(ev.label)) {
      plan.push({ kind: "skip-event", eventId: ev.id, eventLabel: ev.label, reason: "pass-through cash (Lodge)" });
      continue;
    }

    const standalone = STANDALONE_LINKS.find((s) => s.eventLabel === ev.label);
    if (standalone) {
      const contest = contestByName.get(standalone.contestName);
      if (!contest) {
        plan.push({ kind: "skip-event", eventId: ev.id, eventLabel: ev.label, reason: `missing contest "${standalone.contestName}"` });
        continue;
      }
      queueContestUpdate(contest, ev);
      plan.push({ kind: "link-event", eventId: ev.id, eventLabel: ev.label, contestId: contest.id, contestName: contest.name, currentContestId: ev.contest_id });
      continue;
    }

    const day = dayPrefixFor(ev.label);
    const suffix = suffixFor(ev.label);
    const tmpl = DAY_TEMPLATES.find((t) => t.eventSuffix === suffix);
    if (day == null || !tmpl) {
      plan.push({ kind: "skip-event", eventId: ev.id, eventLabel: ev.label, reason: "no per-day template match" });
      continue;
    }

    if (tmpl.existingScrambleType) {
      // Team → match existing "Scramble Day N" by (type, day_number).
      const contest = scrambleByDay.get(day);
      if (!contest) {
        plan.push({ kind: "skip-event", eventId: ev.id, eventLabel: ev.label, reason: `missing scramble contest for day ${day}` });
        continue;
      }
      queueContestUpdate(contest, ev);
      plan.push({ kind: "link-event", eventId: ev.id, eventLabel: ev.label, contestId: contest.id, contestName: contest.name, currentContestId: ev.contest_id });
      continue;
    }

    // Per-day Skins/CTP/LD/LP — match by name, create if missing.
    const desiredName = `${DAY_LABEL[day]} ${tmpl.nameSuffix}`;
    const existing = contestByName.get(desiredName);
    const parentKey = tmpl.parentSuffix ? keyFor(day, tmpl.parentSuffix) : null;

    if (existing) {
      queueContestUpdate(existing, ev, { parentKey });
      plan.push({ kind: "link-event", eventId: ev.id, eventLabel: ev.label, contestId: existing.id, contestName: existing.name, currentContestId: ev.contest_id });
      continue;
    }

    const newKey = keyFor(day, tmpl.eventSuffix);
    pendingByKey.set(newKey, {
      name: desiredName,
      contestType: tmpl.contestType,
      day_number: day,
      buy_in_cost_item_id: ev.cost_item_id ?? null,
      payout_splits: ev.payout_splits ?? null,
      parentKey,
      eventId: ev.id,
      eventLabel: ev.label,
    });
    plan.push({ kind: "create-contest", key: newKey });
  }

  function keyFor(day, suffix) { return `${day}|${suffix}`; }

  function queueContestUpdate(contest, ev, opts = {}) {
    const desired = {};
    if (ev.cost_item_id && contest.buy_in_cost_item_id !== ev.cost_item_id) {
      desired.buy_in_cost_item_id = ev.cost_item_id;
    }
    if (ev.payout_splits && JSON.stringify(contest.payout_splits) !== JSON.stringify(ev.payout_splits)) {
      desired.payout_splits = ev.payout_splits;
    }
    // parent_contest_id is set during pass 2 (we may not yet know the new
    // contest's id at this point if the parent itself is being created).
    if (Object.keys(desired).length > 0) {
      plan.push({
        kind: "update-contest",
        contestId: contest.id,
        contestName: contest.name,
        current: {
          buy_in_cost_item_id: contest.buy_in_cost_item_id,
          payout_splits: contest.payout_splits,
        },
        desired,
      });
    }
    if (opts.parentKey) {
      plan.push({ kind: "set-parent-existing", contestId: contest.id, contestName: contest.name, parentKey: opts.parentKey, current: contest.parent_contest_id });
    }
  }

  // Print plan.
  console.log("Plan:\n");
  for (const p of plan) {
    if (p.kind === "create-contest") {
      const spec = pendingByKey.get(p.key);
      const splitsSummary = spec.payout_splits ? JSON.stringify(spec.payout_splits) : "—";
      console.log(`  [create]   ${spec.name.padEnd(28)}  type=${spec.contestType.padEnd(15)} day=${spec.day_number}`);
      console.log(`             buy_in=${spec.buy_in_cost_item_id || "—"}  splits=${splitsSummary}`);
      if (spec.parentKey) console.log(`             parent=${spec.parentKey}`);
    } else if (p.kind === "update-contest") {
      const fields = Object.keys(p.desired).join(", ");
      console.log(`  [update]   ${p.contestName.padEnd(28)}  fields: ${fields}`);
    } else if (p.kind === "set-parent-existing") {
      console.log(`  [parent]   ${p.contestName.padEnd(28)}  ← parent=${p.parentKey}${p.current ? "  (was already set)" : ""}`);
    } else if (p.kind === "link-event") {
      const change = p.currentContestId === p.contestId ? "(already linked)" : `→ ${p.contestName}`;
      console.log(`  [link]     ${p.eventLabel.padEnd(28)}  ${change}`);
    } else if (p.kind === "skip-event") {
      console.log(`  [skip]     ${p.eventLabel.padEnd(28)}  ${p.reason}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  // === Apply ===
  console.log("\nApplying…\n");

  // Pass A: create new contests. Children before parents may exist (Skins's
  // parent is always existing scramble), so order doesn't matter for FK
  // violation today, but we still create parents-then-children to be safe.
  const createdByKey = new Map();
  // Sort: items whose parentKey is also a creation come last. (Currently
  // none — parents are always existing — but defensive.)
  const creations = plan.filter((p) => p.kind === "create-contest");
  const sorted = creations.sort((a, b) => {
    const aSpec = pendingByKey.get(a.key);
    const bSpec = pendingByKey.get(b.key);
    if (aSpec.parentKey && pendingByKey.has(aSpec.parentKey)) return 1;
    if (bSpec.parentKey && pendingByKey.has(bSpec.parentKey)) return -1;
    return 0;
  });

  for (const p of sorted) {
    const spec = pendingByKey.get(p.key);
    let parentId = null;
    if (spec.parentKey) {
      // Parent is either an existing contest we already mapped, or a sibling
      // that we just created.
      parentId = createdByKey.get(spec.parentKey) ?? resolveParentFromKey(spec.parentKey, scrambleByDay, contestByName);
      if (!parentId) {
        console.warn(`  [warn]    parent missing for ${spec.name} (key=${spec.parentKey}); creating without parent`);
      }
    }

    const insertPayload = {
      trip_id: trip.id,
      name: spec.name,
      contest_type: spec.contestType,
      day_number: spec.day_number,
      sort_order: 0,
      buy_in_cost_item_id: spec.buy_in_cost_item_id,
      payout_splits: spec.payout_splits,
      parent_contest_id: parentId,
    };
    const { data, error } = await admin.from("contests").insert(insertPayload).select().single();
    if (error) throw error;
    createdByKey.set(p.key, data.id);
    contestByName.set(data.name, data);
    console.log(`  [created]  ${spec.name}  (${data.id})`);
  }

  // Pass B: update existing contests (cost item / splits).
  for (const p of plan) {
    if (p.kind !== "update-contest") continue;
    const { error } = await admin.from("contests").update(p.desired).eq("id", p.contestId);
    if (error) throw error;
    console.log(`  [updated]  ${p.contestName}`);
  }

  // Pass C: set parent on existing contests (today: never fires — parent
  // assignments only happen on newly-created Skins rows, which got their
  // parent set at insert time).
  for (const p of plan) {
    if (p.kind !== "set-parent-existing") continue;
    const parentId = resolveParentFromKey(p.parentKey, scrambleByDay, contestByName);
    if (!parentId) {
      console.warn(`  [warn]    parent missing for ${p.contestName} (key=${p.parentKey})`);
      continue;
    }
    const { error } = await admin.from("contests").update({ parent_contest_id: parentId }).eq("id", p.contestId);
    if (error) throw error;
    console.log(`  [parented] ${p.contestName} → parent=${p.parentKey}`);
  }

  // Pass D: link payout_sheet_events.contest_id. For created contests we
  // need to look up by key first.
  for (const p of plan) {
    if (p.kind === "create-contest") {
      const contestId = createdByKey.get(p.key);
      const spec = pendingByKey.get(p.key);
      if (!contestId) continue;
      const { error } = await admin
        .from("payout_sheet_events")
        .update({ contest_id: contestId })
        .eq("id", spec.eventId);
      if (error) throw error;
      console.log(`  [linked]   ${spec.eventLabel} → ${spec.name}`);
    } else if (p.kind === "link-event") {
      if (p.currentContestId === p.contestId) continue;
      const { error } = await admin
        .from("payout_sheet_events")
        .update({ contest_id: p.contestId })
        .eq("id", p.eventId);
      if (error) throw error;
      console.log(`  [linked]   ${p.eventLabel} → ${p.contestName}`);
    }
  }

  console.log("\nDone.");
}

function resolveParentFromKey(parentKey, scrambleByDay, contestByName) {
  // parentKey shape: "<day>|Team" → existing Scramble Day N
  const [dayStr, suffix] = parentKey.split("|");
  if (suffix === "Team") {
    const c = scrambleByDay.get(Number(dayStr));
    return c?.id ?? null;
  }
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
