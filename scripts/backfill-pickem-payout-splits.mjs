#!/usr/bin/env node
// Issue #124 follow-up — copy each Pickem contest's payout structure
// from `pickem_settings.payout_json` (legacy, percentage-based) into
// `contests.payout_splits` (the unified store).
//
// Translation:
//   pickem_settings.payout_json:  [{place: 1, percentage: 50}, ...]
//   contests.payout_splits:       [{place: 1, kind: "percentage", amount: 50}, ...]
//
// Idempotent: skips contests where `contests.payout_splits` already
// matches the translated value.
//
// Usage: node scripts/backfill-pickem-payout-splits.mjs [--dry-run]

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
  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, trip_name")
    .eq("status", "active")
    .single();
  if (!trip) throw new Error("No active trip");
  console.log(`Active trip: ${trip.trip_name} (${trip.id})\n`);

  const { data: contests } = await admin
    .from("contests")
    .select("id, name, contest_type, payout_splits")
    .eq("trip_id", trip.id)
    .eq("contest_type", "pickem");

  if (!contests?.length) {
    console.log("No Pickem contests on the active trip.");
    return;
  }

  for (const c of contests) {
    const { data: settings } = await admin
      .from("pickem_settings")
      .select("payout_json")
      .eq("contest_id", c.id)
      .maybeSingle();

    const legacy = (settings?.payout_json || []);
    const translated = legacy
      .filter((p) => Number(p.percentage ?? 0) > 0)
      .map((p) => ({
        place: Number(p.place),
        kind: "percentage",
        amount: Number(p.percentage),
      }));

    const current = c.payout_splits;
    const same =
      JSON.stringify(current ?? []) === JSON.stringify(translated);
    if (same) {
      console.log(`  [ok]    ${c.name.padEnd(28)}  splits already match — ${translated.length} entries`);
      continue;
    }

    console.log(`  [set]   ${c.name.padEnd(28)}  ${translated.length} entries`);
    for (const t of translated) {
      console.log(`           place ${t.place}: ${t.amount}%`);
    }

    if (DRY_RUN) continue;

    const { error } = await admin
      .from("contests")
      .update({ payout_splits: translated.length > 0 ? translated : null })
      .eq("id", c.id);
    if (error) throw error;
  }

  console.log(`\n${DRY_RUN ? "Dry run — no writes." : "Done."}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
