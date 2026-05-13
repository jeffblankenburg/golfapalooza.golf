#!/usr/bin/env node
// Follow-up to scripts/cleanup-9hole-differentials.mjs.
//
// A 9-hole round computed against 18-hole rating/slope produced a wildly
// low (often negative) differential that briefly entered the player's
// rotation, dragged their Handicap Index toward 0, and froze
// `player_handicaps.low_handicap_index` at that artificial floor. Even
// after the bad differential was cleared, the stale `low_handicap_index`
// caps the player's true HI via the WHS soft/hard cap rules.
//
// This script walks every `player_handicaps` row, recomputes the player's
// HI ignoring the stored low_HI, and — if the result differs from what's
// stored — NULLs `low_handicap_index` and writes the fresh calc. The new
// low_HI is set to the freshly computed HI (per WHS, low_HI = HI when no
// prior low exists), and naturally re-tracks down from there on future
// rounds.
//
// Idempotent. Safe to re-run.
//
// Usage: node scripts/recompute-low-handicaps.mjs [--dry-run]

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
  return { hi, lowHI, used: rule.use };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}\n`);

  const { data: hcps } = await admin
    .from("player_handicaps")
    .select("user_id, handicap_index, low_handicap_index");
  if (!hcps || hcps.length === 0) {
    console.log("No player_handicaps rows.");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  let touched = 0;

  for (const h of hcps) {
    const { data: rows } = await admin
      .from("round_players")
      .select(`
        score_differential,
        round:rounds!inner(round_date, status, round_type)
      `)
      .eq("user_id", h.user_id)
      .eq("round.status", "completed")
      .eq("round.round_type", "18")
      .not("score_differential", "is", null)
      .order("round(round_date)", { ascending: false })
      .limit(20);

    const diffs = (rows || []).map((r) => Number(r.score_differential));
    if (diffs.length < 3) {
      // Not enough rounds — the stored HI shouldn't exist. Skip; the next
      // round-completion will reconcile naturally.
      continue;
    }

    const fresh = calculateHandicapIndex(diffs, null);
    if (!fresh) continue;

    // Only fix users with `low_handicap_index = 0` whose current valid
    // differentials don't support a 0. A 9-hole round computed against
    // an 18-hole rating produces a negative differential that clamps to 0
    // via `Math.max(0, hi)` — that's the unique pollution signature. Real
    // low_HIs floor at the lowest computed HI, so a user with no scratch
    // round shouldn't have a 0 here. Users with a non-zero historical
    // low (even if it's now capping them via WHS) are left alone.
    const storedLow = h.low_handicap_index != null ? Number(h.low_handicap_index) : null;
    if (storedLow !== 0) continue;
    if (Math.min(...diffs) <= 1) continue; // legitimately near-scratch — skip

    console.log(
      `  ${h.user_id}: HI ${h.handicap_index} → ${fresh.hi}, low_HI ${h.low_handicap_index} → ${fresh.lowHI}`,
    );
    touched++;

    if (DRY_RUN) continue;

    await admin
      .from("player_handicaps")
      .update({
        handicap_index: fresh.hi,
        low_handicap_index: fresh.lowHI,
        rounds_used: fresh.used,
        last_calculated_at: new Date().toISOString(),
        effective_date: today,
      })
      .eq("user_id", h.user_id);

    await admin.from("handicap_history").insert({
      user_id: h.user_id,
      handicap_index: fresh.hi,
      rounds_used: fresh.used,
      differentials_used: [...diffs].sort((a, b) => a - b).slice(0, fresh.used),
      calculation_method: `${fresh.use} of ${Math.min(diffs.length, 20)} (low_HI reset)`,
      effective_date: today,
    });
  }

  console.log(`\n${touched} user${touched === 1 ? "" : "s"} ${DRY_RUN ? "would be" : "were"} updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
