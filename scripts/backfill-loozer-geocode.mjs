#!/usr/bin/env node
// Geocode every Loozer with city + state but no cached coordinates.
// Idempotent — only touches rows where latitude is NULL or city/state changed
// since the last geocode (geocoded_at < users.updated_at semantics aren't
// stored, so this script also re-geocodes any row whose city/state was filled
// after the previous run).
//
// Issue #120. Run AFTER migration 00124_user_geocode.sql.
//
// Usage: node scripts/backfill-loozer-geocode.mjs [--dry-run]

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

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!TOKEN) {
  console.error("Missing NEXT_PUBLIC_MAPBOX_TOKEN");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function geocode(city, state) {
  const q = encodeURIComponent(`${city}, ${state}`);
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${TOKEN}&country=us&limit=1`
  );
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const [lng, lat] = data.features[0].center;
    return [lat, lng];
  }
  return null;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { data: users, error } = await admin
    .from("users")
    .select("id, display_name, city, state, latitude")
    .not("city", "is", null)
    .not("state", "is", null);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const todo = (users || []).filter((u) => u.latitude === null);
  console.log(`${todo.length} of ${users?.length || 0} users need geocoding${DRY_RUN ? " (dry run)" : ""}`);

  let ok = 0;
  let miss = 0;
  for (const u of todo) {
    const coords = await geocode(u.city, u.state);
    if (!coords) {
      console.warn(`  - miss: ${u.display_name} (${u.city}, ${u.state})`);
      miss++;
      continue;
    }
    const [lat, lng] = coords;
    console.log(`  + ${u.display_name} → ${lat.toFixed(4)}, ${lng.toFixed(4)} (${u.city}, ${u.state})`);
    ok++;
    if (!DRY_RUN) {
      const { error: upErr } = await admin
        .from("users")
        .update({ latitude: lat, longitude: lng, geocoded_at: new Date().toISOString() })
        .eq("id", u.id);
      if (upErr) console.error(`    write failed: ${upErr.message}`);
    }
    await sleep(120); // ~8/sec, well under Mapbox's 600/min default
  }

  console.log(`Done. matched=${ok} missed=${miss}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
