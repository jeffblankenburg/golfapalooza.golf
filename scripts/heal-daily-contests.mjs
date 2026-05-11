#!/usr/bin/env node
// Self-heal missing per-day daily contests.
//
// For every trip with at least one scramble day, ensures the matching
// per-day daily contests exist:
//   ctp_front, ctp_back, long_drive, long_putt — one each per scramble day
//
// When a contest is missing, the script:
//   1. Synthesizes the canonical name from day-of-week + type suffix
//      (e.g. "Friday CTP Front")
//   2. Finds the matching cost_items row by day name + type indicator,
//      to wire `buy_in_cost_item_id`
//   3. Copies `payout_splits` from a sibling-day contest of the same type
//   4. Inserts the contest
//   5. Mirrors `contest_participants` from a sibling-day's roster — the
//      Loozer-facing option is "in for the trip" so all day rosters
//      should match
//
// Idempotent: a fully-healthy trip is a no-op. Run after any time
// per-day contests are scaffolded (new trips, restored backups, manual
// edits to /admin/events/{id}/contests).
//
// Usage: node scripts/heal-daily-contests.mjs [--dry-run] [--trip=UUID]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const TRIP_ARG = process.argv.find((a) => a.startsWith("--trip="));
const ONLY_TRIP = TRIP_ARG ? TRIP_ARG.split("=")[1] : null;

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

const REQUIRED_TYPES = ["ctp_front", "ctp_back", "long_drive", "long_putt"];

const CONTEST_NAME_SUFFIX = {
  ctp_front: "CTP Front",
  ctp_back: "CTP Back",
  long_drive: "Long Drive",
  long_putt: "Long Putt",
};

// Cost-item name heuristics — patterns found on the active trip. We
// prefer EXACT canonical matches first, then fall back to substring
// matches.
function findCostItemFor(items, dayName, contestType) {
  const lower = items.map((i) => ({ ...i, _lc: i.name.toLowerCase() }));
  const dn = dayName.toLowerCase();
  const typeWords = {
    ctp_front: ["front", "ctp"],
    ctp_back: ["back", "ctp"],
    long_drive: ["long drive"],
    long_putt: ["long putt"],
  }[contestType];
  return lower.find(
    (i) => i._lc.includes(dn) && typeWords.every((w) => i._lc.includes(w)),
  );
}

function dayNameFor(startDate, dayNumber) {
  const date = new Date(startDate + "T00:00:00");
  date.setDate(date.getDate() + dayNumber - 1);
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

async function healTrip(trip) {
  console.log(`\n── Trip: ${trip.trip_name} (${trip.id}) ──`);

  const [{ data: contests }, { data: costItems }] = await Promise.all([
    admin
      .from("contests")
      .select("id, name, contest_type, day_number, buy_in_cost_item_id, payout_splits")
      .eq("trip_id", trip.id)
      .in("contest_type", [...REQUIRED_TYPES, "scramble"]),
    admin
      .from("cost_items")
      .select("id, name, cost")
      .eq("trip_id", trip.id),
  ]);

  const scrambleDays = [
    ...new Set(
      (contests || [])
        .filter((c) => c.contest_type === "scramble" && c.day_number != null)
        .map((c) => c.day_number),
    ),
  ].sort((a, b) => a - b);

  if (scrambleDays.length === 0) {
    console.log("  (no scramble days — skipping)");
    return { created: 0, rosterRows: 0 };
  }

  // Index existing per-day daily contests
  const haveByKey = new Map(); // `${day}-${type}` → contest
  for (const c of contests || []) {
    if (REQUIRED_TYPES.includes(c.contest_type) && c.day_number != null) {
      haveByKey.set(`${c.day_number}-${c.contest_type}`, c);
    }
  }

  // Find missing tuples
  const missing = [];
  for (const day of scrambleDays) {
    for (const type of REQUIRED_TYPES) {
      const key = `${day}-${type}`;
      if (!haveByKey.has(key)) missing.push({ day, type });
    }
  }

  if (missing.length === 0) {
    console.log("  ✓ All per-day daily contests present.");
    return { created: 0, rosterRows: 0 };
  }

  console.log(`  Missing ${missing.length} contest(s):`);
  let created = 0;
  let rosterRowsInserted = 0;

  for (const { day, type } of missing) {
    const dayName = dayNameFor(trip.start_date, day);
    const newName = `${dayName} ${CONTEST_NAME_SUFFIX[type]}`;
    const sibling =
      [...haveByKey.values()].find((c) => c.contest_type === type) ?? null;
    const costItem = findCostItemFor(costItems || [], dayName, type);

    console.log(
      `    [${type}] day ${day} → ${newName}  buy_in=${costItem ? `${costItem.name} ($${costItem.cost})` : "MISSING"}  template=${sibling?.name || "none"}`,
    );

    if (DRY_RUN) continue;

    const payload = {
      trip_id: trip.id,
      name: newName,
      contest_type: type,
      day_number: day,
      sort_order: 0,
      buy_in_cost_item_id: costItem?.id ?? null,
      payout_splits: sibling?.payout_splits ?? [{ kind: "single_winner", place: 1 }],
    };
    const { data: inserted, error: insErr } = await admin
      .from("contests")
      .insert(payload)
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error(`      ✗ insert failed: ${insErr?.message}`);
      continue;
    }
    created += 1;
    haveByKey.set(`${day}-${type}`, { ...payload, id: inserted.id });

    // Mirror roster from a sibling-day contest of the same type.
    if (sibling) {
      const { data: rosterRows, error: rosterReadErr } = await admin
        .from("contest_participants")
        .select("user_id")
        .eq("contest_id", sibling.id);
      if (rosterReadErr) {
        console.error(`      ✗ roster read failed: ${rosterReadErr.message}`);
      } else if (rosterRows && rosterRows.length > 0) {
        const toInsert = rosterRows.map((r) => ({
          contest_id: inserted.id,
          user_id: r.user_id,
        }));
        const { error: rosterErr } = await admin
          .from("contest_participants")
          .insert(toInsert);
        if (rosterErr) {
          console.error(`      ✗ roster copy failed: ${rosterErr.message}`);
        } else {
          rosterRowsInserted += toInsert.length;
          console.log(`      ✓ copied ${toInsert.length} participants from ${sibling.name}`);
        }
      }
    }
  }

  return { created, rosterRows: rosterRowsInserted };
}

async function main() {
  let tripsQuery = admin.from("trip_settings").select("id, trip_name, start_date, status");
  if (ONLY_TRIP) {
    tripsQuery = tripsQuery.eq("id", ONLY_TRIP);
  } else {
    tripsQuery = tripsQuery.in("status", ["active", "test", "draft"]);
  }
  const { data: trips } = await tripsQuery;
  if (!trips || trips.length === 0) {
    console.log("No trips to check.");
    return;
  }

  let totalCreated = 0;
  let totalRoster = 0;
  for (const t of trips) {
    const { created, rosterRows } = await healTrip(t);
    totalCreated += created;
    totalRoster += rosterRows;
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}Created ${totalCreated} contest(s), inserted ${totalRoster} roster row(s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
