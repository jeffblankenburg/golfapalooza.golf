#!/usr/bin/env node
// One-shot: walk every player_handicaps row + every user with no row yet,
// recompute their USGA Handicap Index from completed 18-hole rounds, and
// upsert with source='computed'. Users with <3 valid rounds are left
// alone so their hand-entered handicap stays MANUAL until they accrue
// enough scoring history.
//
// Run after migration 00151_player_handicaps_source.sql to flip every
// player who already has rounds in the system from MANUAL → COMPUTED.
//
// Idempotent. Safe to re-run.
//
// Usage: node scripts/recompute-all-handicaps.mjs [--dry-run]

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

const WHS_TABLE = [
  { min: 3, max: 3, use: 1, adjustment: -2 },
  { min: 4, max: 4, use: 1, adjustment: -1 },
  { min: 5, max: 5, use: 1, adjustment: 0 },
  { min: 6, max: 6, use: 2, adjustment: -1 },
  { min: 7, max: 8, use: 2, adjustment: 0 },
  { min: 9, max: 11, use: 3, adjustment: 0 },
  { min: 12, max: 14, use: 4, adjustment: 0 },
  { min: 15, max: 16, use: 5, adjustment: 0 },
  { min: 17, max: 18, use: 6, adjustment: 0 },
  { min: 19, max: 19, use: 7, adjustment: 0 },
  { min: 20, max: Infinity, use: 8, adjustment: 0 },
];

function calculateHandicapIndex(differentials, currentLowHI) {
  if (differentials.length < 3) return null;
  const sorted = [...differentials].sort((a, b) => a - b);
  const rule = WHS_TABLE.find((r) => differentials.length >= r.min && differentials.length <= r.max);
  if (!rule) return null;
  const used = sorted.slice(0, rule.use);
  const avg = used.reduce((acc, d) => acc + d, 0) / rule.use;
  let hi = Math.floor((avg + rule.adjustment) * 10) / 10;
  hi = Math.max(0, hi);
  const lowHI = currentLowHI != null ? Math.min(currentLowHI, hi) : hi;
  if (currentLowHI != null && hi > currentLowHI + 3.0) {
    const excess = hi - (currentLowHI + 3.0);
    hi = currentLowHI + 3.0 + excess * 0.5;
    hi = Math.floor(hi * 10) / 10;
  }
  if (currentLowHI != null && hi > currentLowHI + 5.0) {
    hi = currentLowHI + 5.0;
  }
  hi = Math.min(54.0, hi);
  return { hi, lowHI, used: rule.use, total: differentials.length };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}\n`);

  // Every real Loozer who could plausibly have rounds. Skip bots and
  // financial-only profiles — they don't play.
  const { data: users, error: usersErr } = await admin
    .from("users")
    .select("id, display_name")
    .eq("is_system", false)
    .eq("is_financial_only", false)
    .order("display_name", { ascending: true });
  if (usersErr) {
    console.error("Failed to load users:", usersErr.message);
    process.exit(1);
  }

  const { data: existingHcps } = await admin
    .from("player_handicaps")
    .select("user_id, handicap_index, low_handicap_index, source");
  const hcpByUser = new Map((existingHcps || []).map((h) => [h.user_id, h]));

  const today = new Date().toISOString().split("T")[0];
  let updated = 0;
  let inserted = 0;
  let skippedTooFew = 0;
  let unchanged = 0;

  for (const u of users || []) {
    const { data: rows } = await admin
      .from("round_players")
      .select(`
        score_differential,
        round:rounds!inner(round_date, status, round_type)
      `)
      .eq("user_id", u.id)
      .eq("round.status", "completed")
      .eq("round.round_type", "18")
      .not("score_differential", "is", null)
      .order("round(round_date)", { ascending: false })
      .limit(20);

    const diffs = (rows || []).map((r) => Number(r.score_differential));
    if (diffs.length < 3) {
      skippedTooFew++;
      continue;
    }

    const existing = hcpByUser.get(u.id) || null;
    const currentLow = existing?.low_handicap_index != null ? Number(existing.low_handicap_index) : null;
    const fresh = calculateHandicapIndex(diffs, currentLow);
    if (!fresh) {
      skippedTooFew++;
      continue;
    }

    const currentHI = existing?.handicap_index != null ? Number(existing.handicap_index) : null;
    const currentSource = existing?.source ?? null;
    const noChange =
      currentHI === fresh.hi &&
      currentSource === "computed" &&
      (currentLow ?? fresh.lowHI) === fresh.lowHI;

    if (noChange) {
      unchanged++;
      continue;
    }

    const wasManual = currentSource === "manual" || currentSource === null;
    const arrow = wasManual ? "MANUAL → COMPUTED" : "COMPUTED → COMPUTED";
    console.log(
      `  ${u.display_name}: HI ${currentHI ?? "—"} → ${fresh.hi} (${fresh.used} of ${fresh.total} diffs) [${arrow}]`,
    );

    if (existing) updated++;
    else inserted++;

    if (DRY_RUN) continue;

    const { error: upErr } = await admin
      .from("player_handicaps")
      .upsert(
        {
          user_id: u.id,
          handicap_index: fresh.hi,
          low_handicap_index: fresh.lowHI,
          rounds_used: fresh.used,
          last_calculated_at: new Date().toISOString(),
          effective_date: today,
          source: "computed",
        },
        { onConflict: "user_id" },
      );
    if (upErr) {
      console.error(`    upsert failed for ${u.display_name}: ${upErr.message}`);
      continue;
    }

    await admin.from("handicap_history").insert({
      user_id: u.id,
      handicap_index: fresh.hi,
      rounds_used: fresh.used,
      differentials_used: [...diffs].sort((a, b) => a - b).slice(0, fresh.used),
      calculation_method: `${fresh.used} of ${Math.min(fresh.total, 20)} (bulk recompute)`,
      effective_date: today,
    });
  }

  console.log("");
  console.log(`Updated:        ${updated}`);
  console.log(`Inserted:       ${inserted}`);
  console.log(`Already current: ${unchanged}`);
  console.log(`Skipped (<3 rounds): ${skippedTooFew}`);
  console.log(`Total users checked: ${(users || []).length}`);
  if (DRY_RUN) console.log("\n(DRY-RUN — no writes performed.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
