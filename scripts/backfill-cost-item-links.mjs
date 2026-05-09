#!/usr/bin/env node
// Issue #125 Phase 3a — link existing cost_items to their trip_options.
// Idempotent: only sets linked_option_id if currently null; junction rows
// inserted with ON CONFLICT DO NOTHING semantics (manually emulated since
// supabase-js doesn't expose ON CONFLICT directly for plain inserts).
//
// Run AFTER migration 00139_cost_item_links.sql.
//
// Usage: node scripts/backfill-cost-item-links.mjs [--dry-run]

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

// Each entry maps a cost_item.name → { optionName, choices: [...] }.
// `choices` is the array of choice values that trigger this cost on the
// linked option. Empty = applies to flat cost (checkbox option) or no
// triggering choice (yes/no select uses ["yes"] explicitly).
const LINKS = [
  // Bundled into Trip Cost (checkbox option, no choice values)
  { itemName: "Operational / Hotel / Food (placeholder)", optionName: "Trip Cost", choices: [] },
  // Hotel main 4 nights
  { itemName: "Hotel Wednesday", optionName: "Trip Cost", choices: [] },
  { itemName: "Hotel Thursday", optionName: "Trip Cost", choices: [] },
  { itemName: "Hotel Friday", optionName: "Trip Cost", choices: [] },
  { itemName: "Hotel Saturday", optionName: "Trip Cost", choices: [] },
  // Meals
  { itemName: "Dinner Wednesday", optionName: "Trip Cost", choices: [] },
  { itemName: "Dinner Thursday", optionName: "Trip Cost", choices: [] },
  { itemName: "Dinner Friday", optionName: "Trip Cost", choices: [] },
  { itemName: "Dinner Saturday", optionName: "Trip Cost", choices: [] },
  { itemName: "Breakfast Thursday", optionName: "Trip Cost", choices: [] },
  { itemName: "Breakfast Friday", optionName: "Trip Cost", choices: [] },
  { itemName: "Breakfast Saturday", optionName: "Trip Cost", choices: [] },
  // Per-day event pots bundled into Trip Cost
  { itemName: "Thursday Team pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Thursday Skins pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Thursday Long Putt pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Friday Team pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Friday Skins pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Friday Long Putt pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Saturday Team pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Saturday Skins pot", optionName: "Trip Cost", choices: [] },
  { itemName: "Saturday Long Putt pot", optionName: "Trip Cost", choices: [] },

  // CTP option ($15 = 6 × $2.50; one item per day per side)
  { itemName: "Thursday CTP Front pot", optionName: "Closest To The Pin", choices: ["yes"] },
  { itemName: "Thursday CTP Back pot", optionName: "Closest To The Pin", choices: ["yes"] },
  { itemName: "Friday CTP Front pot", optionName: "Closest To The Pin", choices: ["yes"] },
  { itemName: "Friday CTP Back pot", optionName: "Closest To The Pin", choices: ["yes"] },
  { itemName: "Saturday CTP Front pot", optionName: "Closest To The Pin", choices: ["yes"] },
  { itemName: "Saturday CTP Back pot", optionName: "Closest To The Pin", choices: ["yes"] },

  // Long Drive option ($15 = 3 × $5)
  { itemName: "Thursday Long Drive pot", optionName: "Long Drive Contest", choices: ["yes"] },
  { itemName: "Friday Long Drive pot", optionName: "Long Drive Contest", choices: ["yes"] },
  { itemName: "Saturday Long Drive pot", optionName: "Long Drive Contest", choices: ["yes"] },

  // Single-row event options
  { itemName: "100 Feet pot", optionName: "100 Feet!", choices: ["yes"] },
  { itemName: "Boland bet", optionName: "Boland Bet", choices: ["yes"] },
  { itemName: "Pickem entry", optionName: "Whitey's CFB Pick'em", choices: ["yes"] },
  { itemName: "KGB Cup entry", optionName: "KGB Cup", choices: ["yes"] },

  // Extra Hotel Nights — multi-choice option:
  //   Hotel Monday contributes only to the "Mon & Tue night" choice
  //   Hotel Tuesday contributes to BOTH "Mon & Tue night" AND "Tue night" choices
  //   Breakfast Wednesday is included in BOTH choices
  { itemName: "Hotel Monday", optionName: "Extra Hotel Nights", choices: ["mon_tue_night_and_wed_breakfast"] },
  { itemName: "Hotel Tuesday", optionName: "Extra Hotel Nights", choices: ["mon_tue_night_and_wed_breakfast", "tue_night_and_wed_breakfast"] },
  { itemName: "Breakfast Wednesday", optionName: "Extra Hotel Nights", choices: ["mon_tue_night_and_wed_breakfast", "tue_night_and_wed_breakfast"] },
];

async function main() {
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})`);

  const [{ data: items }, { data: options }] = await Promise.all([
    admin.from("cost_items").select("id, name, linked_option_id").eq("trip_id", trip.id),
    admin.from("trip_options").select("id, name").eq("trip_id", trip.id),
  ]);
  const itemByName = new Map((items || []).map((i) => [i.name, i]));
  const optionByName = new Map((options || []).map((o) => [o.name, o.id]));

  console.log(`Loaded ${items?.length || 0} cost_items, ${options?.length || 0} trip_options.`);

  const planLinks = []; // { itemId, itemName, optionId, optionName, choices, willUpdateOption, currentOption }
  const planChoices = []; // { itemId, itemName, choiceValue, action: 'insert' | 'skip' }

  // Pre-load existing junction rows for these items
  const itemIds = (items || []).map((i) => i.id);
  let existingChoiceRows = [];
  if (itemIds.length) {
    const { data } = await admin
      .from("cost_item_option_choices")
      .select("cost_item_id, choice_value")
      .in("cost_item_id", itemIds);
    existingChoiceRows = data || [];
  }
  const existingByItem = new Map();
  for (const r of existingChoiceRows) {
    if (!existingByItem.has(r.cost_item_id)) existingByItem.set(r.cost_item_id, new Set());
    existingByItem.get(r.cost_item_id).add(r.choice_value);
  }

  for (const link of LINKS) {
    const item = itemByName.get(link.itemName);
    if (!item) {
      console.warn(`  SKIP — no cost_item named "${link.itemName}"`);
      continue;
    }
    const optionId = optionByName.get(link.optionName);
    if (!optionId) {
      console.warn(`  SKIP — no trip_option named "${link.optionName}"`);
      continue;
    }
    planLinks.push({
      itemId: item.id,
      itemName: item.name,
      optionId,
      optionName: link.optionName,
      currentOption: item.linked_option_id,
      willUpdateOption: !item.linked_option_id || item.linked_option_id !== optionId,
    });
    const existingSet = existingByItem.get(item.id) || new Set();
    for (const choice of link.choices) {
      planChoices.push({
        itemId: item.id,
        itemName: item.name,
        choiceValue: choice,
        action: existingSet.has(choice) ? "skip" : "insert",
      });
    }
  }

  console.log(`\nPlan: ${planLinks.length} option links, ${planChoices.length} choice rows`);
  if (DRY_RUN) {
    console.log("\n--- DRY RUN ---");
    for (const p of planLinks) {
      const tag = p.willUpdateOption ? "set" : "OK ";
      console.log(`  [${tag}] ${p.itemName.padEnd(42)} → ${p.optionName}`);
    }
    for (const p of planChoices) {
      console.log(`  [${p.action}]  ${p.itemName.padEnd(42)} choice="${p.choiceValue}"`);
    }
    return;
  }

  // Apply option links (only if changed)
  let optionUpdated = 0;
  for (const p of planLinks) {
    if (!p.willUpdateOption) continue;
    const { error } = await admin
      .from("cost_items")
      .update({ linked_option_id: p.optionId })
      .eq("id", p.itemId);
    if (error) throw error;
    optionUpdated += 1;
  }

  // Apply choice junction rows (skip duplicates)
  let choicesInserted = 0;
  let choicesSkipped = 0;
  for (const p of planChoices) {
    if (p.action === "skip") {
      choicesSkipped += 1;
      continue;
    }
    const { error } = await admin
      .from("cost_item_option_choices")
      .insert({ cost_item_id: p.itemId, choice_value: p.choiceValue });
    if (error) {
      // Unique-constraint violation = already exists; treat as skip.
      if (error.code !== "23505") throw error;
      choicesSkipped += 1;
      continue;
    }
    choicesInserted += 1;
  }

  console.log(`\nDone. Updated ${optionUpdated} option links; inserted ${choicesInserted} choice rows (${choicesSkipped} already present).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
