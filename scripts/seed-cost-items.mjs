#!/usr/bin/env node
// Issue #125 Phase 2 — initial cost_items backfill for the active trip.
// Idempotent: matches existing rows by (trip_id, name) and updates them.
// Run AFTER migration 00138_cost_items.sql.
//
// Reconciliation target:
//   - "Trip Cost" trip_option = $651
//   - Sum of cost_items where included_in_trip_cost=true should = $651
//   - Each separate trip_option's cost should equal the sum of its
//     contributing cost_items (verified later when option choices reference
//     cost items in Phase 4)
//
// The "Operational" item is a single placeholder for hotel/food/misc that
// totals the Trip Cost minus the explicit payout earmarks. Admin will
// break this down into Hotel / Food / Misc / etc. on /admin/financials/cost-items.
//
// Usage: node scripts/seed-cost-items.mjs [--dry-run]

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
  const { data: trip, error: tripErr } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (tripErr || !trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})`);

  // Look up Trip Cost option's actual cost so we can derive the Operational
  // placeholder dynamically rather than hardcoding $651.
  const { data: tripCostOption } = await admin
    .from("trip_options")
    .select("name, cost")
    .eq("trip_id", trip.id)
    .eq("name", "Trip Cost")
    .single();
  if (!tripCostOption) throw new Error("Could not find 'Trip Cost' trip_option");
  const tripCostTotal = Number(tripCostOption.cost);
  console.log(`Trip Cost option = $${tripCostTotal}`);

  // Explicit payout earmarks bundled inside the Trip Cost lump.
  // Each scramble day funds: $10 Team + $10 Skins + $5 Long Putt = $25/day × 3 days = $75
  const SCRAMBLE_TEAM_PER_DAY = 10;
  const SCRAMBLE_SKINS_PER_DAY = 10;
  const SCRAMBLE_LONG_PUTT_PER_DAY = 5;
  const dayLabel = { 2: "Thursday", 3: "Friday", 4: "Saturday" };
  const days = [2, 3, 4];

  const bundledEarmarks = [];
  for (const day of days) {
    const label = dayLabel[day];
    bundledEarmarks.push({
      name: `${label} Team pot`,
      cost: SCRAMBLE_TEAM_PER_DAY,
      category: "event_pot",
      sort_order: day * 10,
      notes: "Per-attendee earmark inside Trip Cost; funds scramble Team payout pot.",
    });
    bundledEarmarks.push({
      name: `${label} Skins pot`,
      cost: SCRAMBLE_SKINS_PER_DAY,
      category: "event_pot",
      sort_order: day * 10 + 1,
      notes: "Per-attendee earmark inside Trip Cost; funds skins side game.",
    });
    bundledEarmarks.push({
      name: `${label} Long Putt pot`,
      cost: SCRAMBLE_LONG_PUTT_PER_DAY,
      category: "event_pot",
      sort_order: day * 10 + 2,
      notes: "Per-attendee earmark inside Trip Cost; everyone in.",
    });
  }
  const earmarkTotal = bundledEarmarks.reduce((s, r) => s + r.cost, 0);

  const operationalPlaceholder = tripCostTotal - earmarkTotal;
  console.log(
    `Earmarks inside Trip Cost: $${earmarkTotal}; ` +
      `operational placeholder: $${operationalPlaceholder} ` +
      `(admin should break this down into Hotel / Food / Misc).`,
  );

  // Items NOT bundled — funded by separate options.
  const standalone = [];

  // CTP Front + Back × 3 days at $2.50 each (option total $15 = 6 × $2.50)
  for (const day of days) {
    const label = dayLabel[day];
    standalone.push({
      name: `${label} CTP Front pot`,
      cost: 2.5,
      category: "event_pot",
      sort_order: 100 + day * 10,
      notes: "Funded by 'Closest To The Pin' option; half the day's CTP pot.",
    });
    standalone.push({
      name: `${label} CTP Back pot`,
      cost: 2.5,
      category: "event_pot",
      sort_order: 100 + day * 10 + 1,
      notes: "Funded by 'Closest To The Pin' option; half the day's CTP pot.",
    });
  }
  // Long Drive × 3 days at $5 each (option total $15)
  for (const day of days) {
    const label = dayLabel[day];
    standalone.push({
      name: `${label} Long Drive pot`,
      cost: 5,
      category: "event_pot",
      sort_order: 200 + day * 10,
      notes: "Funded by 'Long Drive Contest' option.",
    });
  }
  // Single-row standalone events
  standalone.push({
    name: "100 Feet pot",
    cost: 10,
    category: "event_pot",
    sort_order: 300,
    notes: "Funded by '100 Feet!' option.",
  });
  standalone.push({
    name: "Boland bet",
    cost: 10,
    category: "event_pot",
    sort_order: 310,
    notes: "Funded by 'Boland Bet' option; paid live on the course (not in the cash-needed sheet).",
  });
  standalone.push({
    name: "Pickem entry",
    cost: 20,
    category: "option_entry",
    sort_order: 400,
    notes: "Funded by Whitey's Pick'em option; pot split per pickem_settings.payout_json.",
  });
  standalone.push({
    name: "KGB Cup entry",
    cost: 55,
    category: "pass_through",
    sort_order: 500,
    notes: "Funded by 'KGB Cup' option; pass-through to event organizers (not a payout).",
  });
  standalone.push({
    name: "Lodge Mon",
    cost: 65,
    category: "lodging",
    sort_order: 600,
    notes: "Per-attendee Mon-night lodging; part of 'Mon & Tue night' choice on Extra Hotel Nights.",
  });
  standalone.push({
    name: "Lodge Tue",
    cost: 80,
    category: "lodging",
    sort_order: 610,
    notes: "Per-attendee Tue-night lodging; part of both 'Mon & Tue' and 'Tue night' choices.",
  });

  // Bundled list (with Operational placeholder as the first row)
  const bundled = [
    {
      name: "Operational / Hotel / Food (placeholder)",
      cost: operationalPlaceholder,
      category: "operational",
      sort_order: 1,
      notes:
        "Placeholder for the non-payout portion of Trip Cost. Admin should break this " +
        "into Hotel / Food / Misc / etc. so the breakdown matches reality.",
    },
    ...bundledEarmarks,
  ];

  const allRows = [
    ...bundled.map((r) => ({ ...r, included_in_trip_cost: true })),
    ...standalone.map((r) => ({ ...r, included_in_trip_cost: false })),
  ];

  console.log(`\nPrepared ${allRows.length} rows.`);
  console.log(`  Bundled (in Trip Cost): ${bundled.length} rows = $${bundled.reduce((s, r) => s + r.cost, 0)}`);
  console.log(`  Standalone:             ${standalone.length} rows = $${standalone.reduce((s, r) => s + r.cost, 0)}`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN ---");
    for (const r of allRows) {
      const tag = r.included_in_trip_cost ? "[in trip] " : "[separate]";
      console.log(`  ${tag} ${String(r.sort_order).padStart(4)}  ${r.name.padEnd(42)} $${r.cost}`);
    }
    return;
  }

  const { data: existing } = await admin
    .from("cost_items")
    .select("id, name")
    .eq("trip_id", trip.id);
  const existingByName = new Map((existing || []).map((r) => [r.name, r.id]));

  let inserted = 0;
  let updated = 0;
  for (const r of allRows) {
    const payload = { trip_id: trip.id, ...r };
    const id = existingByName.get(r.name);
    if (id) {
      const { error } = await admin.from("cost_items").update(payload).eq("id", id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin.from("cost_items").insert(payload);
      if (error) throw error;
      inserted += 1;
    }
  }
  console.log(`\nInserted ${inserted}, updated ${updated}.`);

  // Reconciliation check
  const { data: actualRows } = await admin
    .from("cost_items")
    .select("cost, included_in_trip_cost")
    .eq("trip_id", trip.id);
  const actualBundled = (actualRows || [])
    .filter((r) => r.included_in_trip_cost)
    .reduce((s, r) => s + Number(r.cost), 0);
  console.log(`\nReconciliation:`);
  console.log(`  Trip Cost option:                  $${tripCostTotal}`);
  console.log(`  Sum of bundled cost_items:         $${actualBundled}`);
  console.log(`  ${actualBundled === tripCostTotal ? "✓ MATCH" : "✗ MISMATCH"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
