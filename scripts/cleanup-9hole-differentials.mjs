#!/usr/bin/env node
// One-shot cleanup for issue: 9-hole and partial-18 rounds were polluting
// players' handicap indexes because the differential was computed against
// 18-hole rating/slope. After this commit those rounds no longer write a
// differential — but the historical bad rows remain and the affected users'
// player_handicaps may still reflect the bogus calc.
//
// What this script does:
//   1. Finds every round_player with a non-null score_differential where the
//      round is non-18, OR is round_type='18' but has fewer than 18 hole
//      scores recorded.
//   2. NULLs those differentials.
//   3. Recomputes player_handicaps + writes a handicap_history row for every
//      user touched.
//
// Idempotent. Safe to re-run.
//
// Usage: node scripts/cleanup-9hole-differentials.mjs [--dry-run]

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

// USGA WHS lookup — must match src/lib/golf/calculator.ts
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
  return { hi, lowHI, used: rule.use, method: `${rule.use} of ${Math.min(differentials.length, 20)}` };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}\n`);

  // 1. Collect bad rows. We need round_type and the count of round_scores
  // per round_player to decide if the differential is valid.
  const { data: badRows, error } = await admin
    .from("round_players")
    .select(`
      id,
      user_id,
      score_differential,
      round:rounds!inner(id, round_type)
    `)
    .not("score_differential", "is", null);

  if (error) {
    console.error("Failed to load round_players:", error.message);
    process.exit(1);
  }

  // For 18-hole rounds with a differential, count hole scores.
  const eighteenRoundPlayerIds = (badRows || [])
    .filter((r) => (Array.isArray(r.round) ? r.round[0] : r.round).round_type === "18")
    .map((r) => r.id);

  const holeCountByRP = new Map();
  if (eighteenRoundPlayerIds.length > 0) {
    // Supabase doesn't support GROUP BY directly via select; pull rows and tally client-side.
    const { data: scoreRows } = await admin
      .from("round_scores")
      .select("round_player_id")
      .in("round_player_id", eighteenRoundPlayerIds);
    for (const s of scoreRows || []) {
      holeCountByRP.set(s.round_player_id, (holeCountByRP.get(s.round_player_id) ?? 0) + 1);
    }
  }

  const toClear = [];
  for (const r of badRows || []) {
    const round = Array.isArray(r.round) ? r.round[0] : r.round;
    if (round.round_type !== "18") {
      toClear.push({ id: r.id, user_id: r.user_id, reason: `round_type=${round.round_type}` });
      continue;
    }
    const holes = holeCountByRP.get(r.id) ?? 0;
    // 18-hole rounds: only clear if hole scores exist but are incomplete.
    // Quick Entry rounds have 0 hole scores AND a trusted final_gross_score
    // — those stay.
    if (holes > 0 && holes < 18) {
      toClear.push({ id: r.id, user_id: r.user_id, reason: `partial 18 (${holes}/18 holes)` });
    }
  }

  console.log(`Found ${toClear.length} round_player rows with invalid differentials.`);
  if (toClear.length === 0) {
    console.log("Nothing to clean. Exiting.");
    return;
  }

  // Group by reason for readability.
  const byReason = new Map();
  for (const c of toClear) {
    byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
  }
  for (const [reason, count] of byReason) {
    console.log(`  ${reason}: ${count}`);
  }

  const affectedUsers = [...new Set(toClear.map((c) => c.user_id))];
  console.log(`\nAffected users: ${affectedUsers.length}`);

  if (DRY_RUN) {
    console.log("\nDRY-RUN — no changes written.");
    return;
  }

  // 2. NULL the bad differentials.
  console.log("\nClearing differentials...");
  const ids = toClear.map((c) => c.id);
  // Batch in chunks of 500 to stay under URL limits.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error: updErr } = await admin
      .from("round_players")
      .update({ score_differential: null })
      .in("id", chunk);
    if (updErr) {
      console.error(`  Failed to clear chunk: ${updErr.message}`);
      process.exit(1);
    }
  }
  console.log(`  Cleared ${ids.length} rows.`);

  // 3. Recompute handicap for each affected user.
  console.log("\nRecomputing player_handicaps...");
  const today = new Date().toISOString().split("T")[0];
  for (const userId of affectedUsers) {
    const { data: rounds } = await admin
      .from("round_players")
      .select(`
        score_differential,
        round:rounds!inner(round_date, status, round_type)
      `)
      .eq("user_id", userId)
      .eq("round.status", "completed")
      .eq("round.round_type", "18")
      .not("score_differential", "is", null)
      .order("round(round_date)", { ascending: false })
      .limit(20);

    const diffs = (rounds || []).map((r) => Number(r.score_differential));
    const { data: existing } = await admin
      .from("player_handicaps")
      .select("low_handicap_index, handicap_index")
      .eq("user_id", userId)
      .maybeSingle();

    const result = calculateHandicapIndex(diffs, existing?.low_handicap_index ?? null);

    if (!result) {
      // Not enough rounds — clear the handicap.
      if (existing) {
        await admin.from("player_handicaps").delete().eq("user_id", userId);
        console.log(`  ${userId}: cleared (fewer than 3 eligible rounds)`);
      } else {
        console.log(`  ${userId}: skipped (no handicap, no eligible rounds)`);
      }
      continue;
    }

    await admin.from("player_handicaps").upsert(
      {
        user_id: userId,
        handicap_index: result.hi,
        low_handicap_index: result.lowHI,
        rounds_used: result.used,
        last_calculated_at: new Date().toISOString(),
        effective_date: today,
      },
      { onConflict: "user_id" },
    );

    await admin.from("handicap_history").insert({
      user_id: userId,
      handicap_index: result.hi,
      rounds_used: result.used,
      differentials_used: diffs.slice(0, result.used).sort((a, b) => a - b).slice(0, result.used),
      calculation_method: result.method,
      effective_date: today,
    });

    const was = existing?.handicap_index;
    console.log(`  ${userId}: ${was ?? "—"} → ${result.hi}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
