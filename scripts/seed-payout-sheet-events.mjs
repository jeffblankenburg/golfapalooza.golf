#!/usr/bin/env node
// Seed payout_sheet_events for the active trip — issue #103.
// Idempotent: matches existing rows by (trip_id, label) and updates them.
// Run AFTER migration 00135_payout_sheet_events.sql.
//
// Usage: node scripts/seed-payout-sheet-events.mjs [--dry-run]

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

  const [{ data: contests }, { data: opts }] = await Promise.all([
    admin
      .from("contests")
      .select("id, name, contest_type, day_number")
      .eq("trip_id", trip.id),
    admin.from("trip_options").select("id, name").eq("trip_id", trip.id),
  ]);

  const scrambleByDay = new Map(
    (contests || [])
      .filter((c) => c.contest_type === "scramble" && c.day_number)
      .map((c) => [c.day_number, c.id]),
  );
  const contestByName = new Map((contests || []).map((c) => [c.name, c.id]));
  const optByName = new Map((opts || []).map((o) => [o.name, o.id]));

  function need(map, key, kind) {
    const id = map.get(key);
    if (!id) throw new Error(`Missing ${kind}: ${key}`);
    return id;
  }

  const dayLabel = { 2: "Thursday", 3: "Friday", 4: "Saturday" };
  const rows = [];

  // Per-day blocks: Team / Skins / CTP Front / CTP Back / Long Drive / Long Putt
  for (const day of [2, 3, 4]) {
    const cid = need(scrambleByDay, day, `scramble day ${day}`);
    const label = dayLabel[day];
    const base = day * 10;
    rows.push({
      label: `${label} Team`,
      sort_order: base,
      participant_source: "scramble",
      source_ref: cid,
      amount_per_participant: 10,
      day_count: 1,
      is_payout: true,
      winner_source: "scramble_team",
      winner_day_number: null,
      notes: "Scramble entry-fee earmark",
    });
    rows.push({
      label: `${label} Skins`,
      sort_order: base + 1,
      participant_source: "scramble",
      source_ref: cid,
      amount_per_participant: 10,
      day_count: 1,
      is_payout: true,
      winner_source: "scramble_skins",
      winner_day_number: null,
      notes: "Skins side game; same participants as scramble",
    });
    rows.push({
      label: `${label} CTP Front`,
      sort_order: base + 2,
      participant_source: "option",
      source_ref: need(optByName, "Closest To The Pin", "option"),
      amount_per_participant: 2.5,
      day_count: 1,
      is_payout: true,
      winner_source: "ctp_front",
      winner_day_number: day,
      notes: "Closest to the Pin (front 9) — half the day's $5/player CTP pot",
    });
    rows.push({
      label: `${label} CTP Back`,
      sort_order: base + 3,
      participant_source: "option",
      source_ref: need(optByName, "Closest To The Pin", "option"),
      amount_per_participant: 2.5,
      day_count: 1,
      is_payout: true,
      winner_source: "ctp_back",
      winner_day_number: day,
      notes: "Closest to the Pin (back 9) — half the day's $5/player CTP pot",
    });
    rows.push({
      label: `${label} Long Drive`,
      sort_order: base + 4,
      participant_source: "option",
      source_ref: need(optByName, "Long Drive Contest", "option"),
      amount_per_participant: 5,
      day_count: 1,
      is_payout: true,
      winner_source: "long_drive",
      winner_day_number: day,
      notes: "Long Drive — per day",
    });
    rows.push({
      label: `${label} Long Putt`,
      sort_order: base + 5,
      participant_source: "all_attendees",
      source_ref: null,
      amount_per_participant: 5,
      day_count: 1,
      is_payout: true,
      winner_source: "long_putt",
      winner_day_number: day,
      notes: "Long Putt — everyone in, $5/player/day",
    });
  }

  // Boland intentionally excluded — paid live on the course, not tracked here.
  rows.push({
    label: "KGB Cup",
    sort_order: 110,
    participant_source: "option",
    source_ref: need(optByName, "KGB Cup", "option"),
    amount_per_participant: 55,
    day_count: 1,
    is_payout: false,
    winner_source: "none",
    winner_day_number: null,
    notes: "Cash to pay for the event — no prize",
  });
  rows.push({
    label: "100 Feet",
    sort_order: 140,
    participant_source: "option",
    source_ref: need(optByName, "100 Feet!", "option"),
    amount_per_participant: 10,
    day_count: 1,
    is_payout: true,
    winner_source: "hundred_feet",
    winner_day_number: null,
  });
  rows.push({
    label: "PickEm",
    sort_order: 150,
    participant_source: "pickem_payments",
    source_ref: need(contestByName, "Whitey's Pick'em", "Pickem contest"),
    amount_per_participant: 20,
    day_count: 1,
    is_payout: true,
    winner_source: "pickem",
    winner_day_number: null,
    notes: "Pot = $20 × paid participants; split per payout_json on results",
  });
  rows.push({
    label: "Lodge Mon",
    sort_order: 160,
    participant_source: "option_value",
    source_ref: need(optByName, "Extra Hotel Nights", "option"),
    source_filter: { choice_values: ["mon_tue_night_and_wed_breakfast"] },
    amount_per_participant: 65,
    day_count: 1,
    is_payout: false,
    winner_source: "none",
    winner_day_number: null,
    notes: "Mon night stay — pass-through cash",
  });
  rows.push({
    label: "Lodge Tue",
    sort_order: 170,
    participant_source: "option_value",
    source_ref: need(optByName, "Extra Hotel Nights", "option"),
    source_filter: {
      choice_values: ["mon_tue_night_and_wed_breakfast", "tue_night_and_wed_breakfast"],
    },
    amount_per_participant: 80,
    day_count: 1,
    is_payout: false,
    winner_source: "none",
    winner_day_number: null,
    notes: "Tue night stay — pass-through cash",
  });

  console.log(`Prepared ${rows.length} rows.`);

  if (DRY_RUN) {
    for (const r of rows) console.log(" ", r.label, "→", r);
    return;
  }

  const { data: existing } = await admin
    .from("payout_sheet_events")
    .select("id, label")
    .eq("trip_id", trip.id);
  const existingByLabel = new Map((existing || []).map((r) => [r.label, r.id]));

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const payload = { trip_id: trip.id, ...r, source_filter: r.source_filter ?? null };
    const id = existingByLabel.get(r.label);
    if (id) {
      const { error } = await admin
        .from("payout_sheet_events")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin.from("payout_sheet_events").insert(payload);
      if (error) throw error;
      inserted += 1;
    }
  }
  console.log(`Inserted ${inserted}, updated ${updated}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
