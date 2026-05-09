#!/usr/bin/env node
// Issue #125 Phase 3 (continued) — link payout_sheet_events rows to their
// funding cost_item. Idempotent: only sets cost_item_id when currently null.
//
// Naming convention bridges the two tables: a payout-sheet row labeled
// "Thursday Team" is funded by a cost_item named "Thursday Team pot".
// PickEm and KGB Cup use "entry" instead of "pot". Lodge rows are skipped
// because their per-participant amount aggregates multiple cost_items
// (e.g. Mon-stayer = Hotel Mon + Hotel Tue + Breakfast Wed) — admin should
// resolve those by either splitting the row or accepting derivation later.
//
// Run AFTER migration 00140_payout_sheet_events_cost_item.sql.
//
// Usage: node scripts/backfill-payout-event-cost-items.mjs [--dry-run]

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

// Per-row mapping. payout_sheet_events.label → cost_items.name.
// Skip entries that don't have a clean 1:1 mapping (Lodge Mon / Lodge Tue).
const LINK_MAP = [
  // Per-day scramble pots (× 3)
  ...["Thursday", "Friday", "Saturday"].flatMap((day) => [
    { eventLabel: `${day} Team`, costItemName: `${day} Team pot` },
    { eventLabel: `${day} Skins`, costItemName: `${day} Skins pot` },
    { eventLabel: `${day} CTP Front`, costItemName: `${day} CTP Front pot` },
    { eventLabel: `${day} CTP Back`, costItemName: `${day} CTP Back pot` },
    { eventLabel: `${day} Long Drive`, costItemName: `${day} Long Drive pot` },
    { eventLabel: `${day} Long Putt`, costItemName: `${day} Long Putt pot` },
  ]),
  // Single-row events
  { eventLabel: "100 Feet", costItemName: "100 Feet pot" },
  { eventLabel: "PickEm", costItemName: "Pickem entry" },
  { eventLabel: "KGB Cup", costItemName: "KGB Cup entry" },
  // Lodge Mon / Lodge Tue intentionally NOT linked — pass-through cash that
  // aggregates multiple cost_items per stayer; admin should refactor those
  // separately.
];

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})`);

  const [{ data: events }, { data: items }] = await Promise.all([
    admin
      .from("payout_sheet_events")
      .select("id, label, cost_item_id, amount_per_participant")
      .eq("trip_id", trip.id),
    admin
      .from("cost_items")
      .select("id, name, cost")
      .eq("trip_id", trip.id),
  ]);

  const eventByLabel = new Map((events || []).map((e) => [e.label, e]));
  const itemByName = new Map((items || []).map((i) => [i.name, i]));

  console.log(
    `Loaded ${events?.length || 0} payout_sheet_events, ${items?.length || 0} cost_items.\n`,
  );

  const plan = [];
  for (const link of LINK_MAP) {
    const ev = eventByLabel.get(link.eventLabel);
    if (!ev) {
      plan.push({ status: "skip", reason: "no event", ...link });
      continue;
    }
    const it = itemByName.get(link.costItemName);
    if (!it) {
      plan.push({ status: "skip", reason: "no cost_item", ...link });
      continue;
    }
    if (ev.cost_item_id === it.id) {
      plan.push({ status: "ok", reason: "already linked", ...link, eventId: ev.id, itemId: it.id, eventAmount: ev.amount_per_participant, itemCost: it.cost });
      continue;
    }
    if (ev.cost_item_id) {
      plan.push({ status: "skip", reason: `already linked to a different cost_item (${ev.cost_item_id})`, ...link });
      continue;
    }
    plan.push({ status: "set", ...link, eventId: ev.id, itemId: it.id, eventAmount: ev.amount_per_participant, itemCost: it.cost });
  }

  // Identify any events not in LINK_MAP at all so admin can see what's left
  const linkedLabels = new Set(LINK_MAP.map((l) => l.eventLabel));
  const unmapped = (events || []).filter((e) => !linkedLabels.has(e.label));

  console.log("Plan:");
  for (const p of plan) {
    if (p.status === "set") {
      const drift = Number(p.eventAmount) === Number(p.itemCost) ? "" : " ← AMOUNT DIFFERS (will use cost_item value)";
      console.log(`  [set]   ${p.eventLabel.padEnd(25)} → ${p.costItemName}  ($${p.eventAmount} → $${p.itemCost})${drift}`);
    } else if (p.status === "ok") {
      console.log(`  [ok]    ${p.eventLabel.padEnd(25)} → ${p.costItemName}  (already linked)`);
    } else {
      console.log(`  [skip]  ${p.eventLabel.padEnd(25)} → ${p.costItemName}  — ${p.reason}`);
    }
  }
  if (unmapped.length > 0) {
    console.log("\nNot in LINK_MAP (admin to handle):");
    for (const e of unmapped) {
      console.log(`  [unmapped] ${e.label.padEnd(25)}  ($${e.amount_per_participant})`);
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
      .update({ cost_item_id: p.itemId })
      .eq("id", p.eventId);
    if (error) throw error;
    updated += 1;
  }
  console.log(`\nDone. Updated ${updated} cost_item links.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
