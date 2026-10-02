#!/usr/bin/env node
// Give every fake TKO Trivia member a handicap index so team generation + auto
// handicaps have real data to work with. Idempotent (upsert on user_id).
// Only touches the fake members (sentinel phone +1 555-019-00NN) — never a real
// user's handicap.
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// Usage: node scripts/seed-tko-handicaps.mjs [--dry-run]

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PHONE_PREFIX = "+1555019"; // fake-member sentinel range

// Spread, non-monotonic handicaps so quartiles are meaningful (~2 to ~32).
function handicapFor(i) {
  const h = 2 + ((i * 13) % 30) + (i % 5) * 0.2;
  return Math.round(h * 10) / 10;
}

const { data: fakes, error } = await admin
  .from("v2_profiles")
  .select("id, phone, display_name")
  .like("phone", `${PHONE_PREFIX}%`)
  .order("phone");
if (error) {
  console.error("Lookup failed:", error.message);
  process.exit(1);
}
if (!fakes || fakes.length === 0) {
  console.error("No fake members found (did you run seed-tko-fake-members.mjs?).");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();
const rows = fakes.map((f, i) => {
  const hi = handicapFor(i);
  return {
    user_id: f.id,
    handicap_index: hi,
    low_handicap_index: Math.max(0, Math.round((hi - 1.5) * 10) / 10),
    rounds_used: 20,
    last_calculated_at: now,
    effective_date: today,
    updated_at: now,
  };
});

console.log(`Fake members: ${fakes.length}`);
console.log(`Handicap range: ${Math.min(...rows.map((r) => r.handicap_index))} to ${Math.max(...rows.map((r) => r.handicap_index))}`);

if (DRY_RUN) {
  console.log("[dry-run] no writes.");
  process.exit(0);
}

const { error: upErr } = await admin.from("v2_player_handicaps").upsert(rows, { onConflict: "user_id" });
if (upErr) {
  console.error("Upsert failed:", upErr.message);
  process.exit(1);
}
console.log(`✓ Set handicaps for ${rows.length} members.`);
