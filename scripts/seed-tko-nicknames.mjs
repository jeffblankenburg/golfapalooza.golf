#!/usr/bin/env node
// Give every fake TKO Trivia member a unique, fun nickname. Sets BOTH `nickname`
// and `display_name` (pickName reads display_name in nickname mode; real names stay
// in first/last for "real" mode). Idempotent; only touches fake members (sentinel
// phone +1 555-019-00NN).
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// Usage: node scripts/seed-tko-nicknames.mjs [--dry-run]

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

const PHONE_PREFIX = "+1555019";

// 60 unique nicknames (golf-flavored); plenty of headroom over the fake roster.
const NICKNAMES = [
  "Ace", "Birdie", "Bogey", "Mulligan", "Slice", "Hook", "Fore", "Divot", "Eagle", "Albatross",
  "Chip", "Putts", "Fairway", "Rough", "Bunker", "Sandy", "Gimme", "Shank", "Whiff", "Tiger",
  "Lefty", "Bubba", "Boom Boom", "Walrus", "Shark", "Golden Bear", "Big Easy", "Wild Thing", "Radar", "Hollywood",
  "Doc", "Sarge", "Rookie", "Skipper", "Chief", "Hustler", "Clutch", "Lucky", "Smalls", "Danger",
  "Maverick", "Wingman", "Scratch", "Duffer", "Nipper", "Flagstick", "Cabbage", "Tempo", "Grip", "Stroke",
  "Wedge", "Draw", "Fade", "Pin High", "Breezy", "Yips", "Snowman", "Turbo", "Zen", "Jigger",
];

const { data: fakes, error } = await admin
  .from("v2_profiles")
  .select("id, phone, first_name, last_name")
  .like("phone", `${PHONE_PREFIX}%`)
  .order("phone");
if (error) {
  console.error("Lookup failed:", error.message);
  process.exit(1);
}
if (!fakes || fakes.length === 0) {
  console.error("No fake members found.");
  process.exit(1);
}
if (fakes.length > NICKNAMES.length) {
  console.error(`Need ${fakes.length} nicknames but only have ${NICKNAMES.length}. Add more.`);
  process.exit(1);
}

const now = new Date().toISOString();
const plan = fakes.map((f, i) => ({ id: f.id, real: `${f.first_name} ${f.last_name}`, nick: NICKNAMES[i] }));

console.log(`Fake members: ${fakes.length}`);
plan.slice(0, 5).forEach((p) => console.log(`  ${p.real} → "${p.nick}"`));
console.log(`  … and ${plan.length - 5} more`);

if (DRY_RUN) {
  console.log("[dry-run] no writes.");
  process.exit(0);
}

const results = await Promise.all(
  plan.map((p) =>
    admin.from("v2_profiles").update({ nickname: p.nick, display_name: p.nick, updated_at: now }).eq("id", p.id),
  ),
);
const failed = results.filter((r) => r.error);
if (failed.length) {
  console.error(`${failed.length} updates failed:`, failed[0].error?.message);
  process.exit(1);
}
console.log(`✓ Set unique nicknames for ${plan.length} members.`);
