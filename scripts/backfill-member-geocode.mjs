#!/usr/bin/env node
// Re-geocode v2 member profiles from their CURRENT address so the member map shows
// the right place. v2 profile saves didn't used to geocode, so stored lat/lng drifted
// stale; this realigns everyone who has at least a city + state.
//
// Precision follows what they have: "address, city, state" (house) when an address is
// set, else "city, state" (city center). map_visibility coarsening is applied at read
// time, so storing the precise point here is correct.
//
// Usage:
//   node scripts/backfill-member-geocode.mjs --dry-run   # preview
//   node scripts/backfill-member-geocode.mjs             # apply

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DRY_RUN = process.argv.includes("--dry-run");
function loadDotEnv(p){try{for(const raw of readFileSync(p,"utf8").split("\n")){const l=raw.trim();if(!l||l.startsWith("#"))continue;const e=l.indexOf("=");if(e<0)continue;const k=l.slice(0,e).trim();const v=l.slice(e+1).trim().replace(/^["']|["']$/g,"");if(!process.env[k])process.env[k]=v;}}catch{}}
loadDotEnv(resolve(REPO_ROOT, ".env.local"));

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!TOKEN) { console.error("No NEXT_PUBLIC_MAPBOX_TOKEN"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Full state names disambiguate Mapbox ("Eureka, MO" wrongly resolves to Montana).
const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };

// Mirrors src/lib/v2/geocode.ts: most specific first, fall back to broader.
async function geocode({ address, city, state: st }) {
  const state = st ? (STATE_NAMES[st.toUpperCase()] ?? st) : st;
  const queries = [];
  if (address && city && state) queries.push(`${address}, ${city}, ${state}`);
  if (city && state) queries.push(`${city}, ${state}`);
  for (const q of queries) {
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${TOKEN}&country=us&limit=1`);
      const data = await res.json();
      if (data.features?.length) { const [lng, lat] = data.features[0].center; return [lat, lng]; }
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const { data: profiles, error } = await admin
    .from("v2_profiles")
    .select("id, display_name, address, city, state, latitude, longitude")
    .not("city", "is", null)
    .not("state", "is", null);
  if (error) { console.error(error.message); process.exit(1); }

  let updated = 0, unchanged = 0, failed = 0;
  for (const p of profiles || []) {
    const coords = await geocode(p);
    await sleep(120); // be gentle on the geocoding API
    if (!coords) { failed++; console.log(`  ✗ ${p.display_name}: no geocode for "${[p.address, p.city, p.state].filter(Boolean).join(", ")}"`); continue; }
    const [lat, lng] = coords;
    const same = p.latitude != null && Math.abs(p.latitude - lat) < 1e-5 && Math.abs(p.longitude - lng) < 1e-5;
    if (same) { unchanged++; continue; }
    console.log(`  ${DRY_RUN ? "would move" : "moved"} ${p.display_name}: (${p.latitude}, ${p.longitude}) -> (${lat}, ${lng})`);
    if (!DRY_RUN) {
      const { error: upErr } = await admin.from("v2_profiles").update({ latitude: lat, longitude: lng }).eq("id", p.id);
      if (upErr) { failed++; console.log(`    update failed: ${upErr.message}`); continue; }
    }
    updated++;
  }
  console.log(`\n${DRY_RUN ? "[dry run] " : ""}done. ${updated} ${DRY_RUN ? "to move" : "moved"}, ${unchanged} already correct, ${failed} failed, of ${(profiles || []).length} with city+state.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
