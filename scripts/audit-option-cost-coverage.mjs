#!/usr/bin/env node
// Issue #125 Phase 4 (Workstream B) — audit option cost coverage.
//
// For each `trip_options` row on the active and test trips, report whether
// its stored cost (top-level for checkbox; per-choice for select/multi)
// is "covered" by `cost_items` links:
//
//   - option_type='trip_cost'       → covered by derivation; no links needed
//   - option_type='checkbox'        → covered if any cost_item has
//                                     linked_option_id = option.id
//                                     AND no junction row (flat-cost item)
//   - option_type='select|multi'    → each choice with cost > 0 needs a
//                                     cost_item_option_choices row tying
//                                     it (by choice value) to a cost_item
//   - option_type='quantity'        → covered if any cost_item has
//                                     linked_option_id = option.id
//                                     (cost per unit comes from cost_items)
//   - option_type='text|number'     → no cost; skip
//
// Output: per-trip table of (option, status, gap). Exit 0; never writes.
//
// Usage: node scripts/audit-option-cost-coverage.mjs

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
  const { data: trips } = await admin
    .from("trip_settings")
    .select("id, trip_name, status")
    .in("status", ["active", "test"]);
  if (!trips || trips.length === 0) {
    console.log("No active/test trips.");
    return;
  }

  let overallGaps = 0;

  for (const trip of trips) {
    console.log(`\n=== Trip: ${trip.trip_name} (${trip.status}) [${trip.id}] ===\n`);

    const [{ data: options }, { data: items }] = await Promise.all([
      admin
        .from("trip_options")
        .select("id, name, option_type, cost, choices")
        .eq("trip_id", trip.id)
        .order("sort_order"),
      admin
        .from("cost_items")
        .select("id, name, cost, linked_option_id, choices:cost_item_option_choices(choice_value)")
        .eq("trip_id", trip.id),
    ]);

    if (!options || options.length === 0) {
      console.log("  (no options)");
      continue;
    }

    const itemsByOption = new Map();
    for (const it of items || []) {
      if (!it.linked_option_id) continue;
      if (!itemsByOption.has(it.linked_option_id)) itemsByOption.set(it.linked_option_id, []);
      itemsByOption.get(it.linked_option_id).push(it);
    }

    for (const opt of options) {
      const linked = itemsByOption.get(opt.id) || [];
      const status = [];

      if (opt.option_type === "trip_cost") {
        status.push(`OK  trip_cost (auto-derived from included_in_trip_cost items)`);
      } else if (opt.option_type === "text" || opt.option_type === "number") {
        status.push(`OK  ${opt.option_type} (no cost)`);
      } else if (opt.option_type === "checkbox") {
        const flat = linked.filter((i) => (i.choices || []).length === 0);
        if (flat.length > 0) {
          status.push(`OK  checkbox covered by ${flat.length} flat cost_item(s) = $${flat.reduce((s, i) => s + Number(i.cost), 0)}`);
        } else if (Number(opt.cost ?? 0) > 0) {
          status.push(`GAP checkbox cost=$${opt.cost} but no flat cost_item linked`);
          overallGaps += 1;
        } else {
          status.push(`OK  checkbox cost=0 (no link needed)`);
        }
      } else if (opt.option_type === "quantity") {
        if (linked.length > 0) {
          status.push(`OK  quantity covered by ${linked.length} cost_item(s)`);
        } else if (Number(opt.cost ?? 0) > 0) {
          status.push(`GAP quantity cost=$${opt.cost} but no cost_item linked`);
          overallGaps += 1;
        } else {
          status.push(`OK  quantity cost=0 (no link needed)`);
        }
      } else if (opt.option_type === "select" || opt.option_type === "multi_select") {
        const choices = Array.isArray(opt.choices) ? opt.choices : [];
        let choiceGaps = 0;
        for (const ch of choices) {
          const storedCost = Number(ch.cost ?? 0);
          const matching = linked.filter((it) => (it.choices || []).some((c) => c.choice_value === ch.value));
          if (matching.length > 0) {
            const derived = matching.reduce((s, i) => s + Number(i.cost), 0);
            const drift = storedCost === derived ? "" : ` (drift: stored=$${storedCost} vs linked=$${derived})`;
            status.push(`    OK   choice "${ch.label || ch.value}" → ${matching.length} item(s) = $${derived}${drift}`);
          } else if (storedCost > 0) {
            status.push(`    GAP  choice "${ch.label || ch.value}" cost=$${storedCost} but no cost_item linked`);
            choiceGaps += 1;
          } else {
            status.push(`    OK   choice "${ch.label || ch.value}" cost=0`);
          }
        }
        if (choiceGaps > 0) overallGaps += choiceGaps;
        status.unshift(`${choiceGaps === 0 ? "OK " : "GAP"} ${opt.option_type} "${opt.name}" — ${choices.length} choices`);
      } else {
        status.push(`?   unknown option_type ${opt.option_type}`);
      }

      console.log(`  ${opt.name}  [${opt.option_type}]`);
      for (const line of status) console.log(`    ${line}`);
    }
  }

  console.log(`\n${overallGaps === 0 ? "All clear ✓" : `${overallGaps} gap(s) — Phase 5 column drops are unsafe until linked.`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
