#!/usr/bin/env node
// One-shot manual trigger of the birthday cron logic. Same behavior as the
// scheduled /api/cron/birthday-posts run — uses Al Pine as the sender,
// posts to the "All Loozers" room, idempotent via birthday_posts.
//
// Usage: node scripts/run-birthday-cron.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

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

// Pull the message templates straight from src/lib/birthday/messages.ts so the
// script never drifts. We grep the array literal — no TS compilation needed.
function loadMessages() {
  const src = readFileSync(resolve(REPO_ROOT, "src/lib/birthday/messages.ts"), "utf8");
  const match = src.match(/BIRTHDAY_MESSAGES:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error("Could not locate BIRTHDAY_MESSAGES array");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
const BIRTHDAY_MESSAGES = loadMessages();
function pickMessage(name, age) {
  const tpl = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)];
  return tpl.replaceAll("{name}", name).replaceAll("{age}", String(age));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Inline copy of the relevant helpers (avoids loading the Next runtime).
function partsInTimezone(tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: +parts.find((p) => p.type === "year").value,
    month: +parts.find((p) => p.type === "month").value,
    day: +parts.find((p) => p.type === "day").value,
  };
}

const { data: trip } = await admin
  .from("trip_settings")
  .select("timezone")
  .eq("status", "active")
  .single();
const tz = trip?.timezone || "America/New_York";
const { month, day, year } = partsInTimezone(tz);
console.log(`Today in ${tz}: ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);

const { data: candidates } = await admin
  .from("users")
  .select("id, display_name, birthday")
  .not("birthday", "is", null);

const birthdays = (candidates || [])
  .filter((u) => {
    const [, m, d] = u.birthday.split("-").map(Number);
    return m === month && d === day;
  })
  .map((u) => {
    const [by] = u.birthday.split("-").map(Number);
    return { id: u.id, display_name: u.display_name, age: Math.max(0, year - by) };
  });

console.log(`Birthdays today: ${birthdays.length}`);
if (birthdays.length === 0) {
  console.log("Nothing to post.");
  process.exit(0);
}

const { data: room } = await admin
  .from("chat_rooms")
  .select("id")
  .eq("type", "group")
  .eq("name", "All Loozers")
  .single();
if (!room) {
  console.error("All Loozers room not found");
  process.exit(1);
}

const { data: sender } = await admin
  .from("users")
  .select("id, display_name")
  .eq("is_system", true)
  .limit(1)
  .maybeSingle();
if (!sender) {
  console.error("No system user found — run scripts/create-al-pine.mjs first");
  process.exit(1);
}
console.log(`Posting as: ${sender.display_name} (${sender.id})`);

for (const b of birthdays) {
  const { data: existing } = await admin
    .from("birthday_posts")
    .select("user_id")
    .eq("user_id", b.id)
    .eq("year", year)
    .eq("room_id", room.id)
    .maybeSingle();

  if (existing) {
    console.log(`- ${b.display_name}: already posted in ${year}, skipping`);
    continue;
  }

  const content = pickMessage(b.display_name, b.age);

  const { error: msgErr } = await admin
    .from("chat_messages")
    .insert({ room_id: room.id, sender_id: sender.id, content });
  if (msgErr) {
    console.error(`- ${b.display_name}: post failed — ${msgErr.message}`);
    continue;
  }

  const { error: trackErr } = await admin
    .from("birthday_posts")
    .insert({ user_id: b.id, year, room_id: room.id });
  if (trackErr) {
    console.error(`- ${b.display_name}: posted but tracking failed — ${trackErr.message}`);
    continue;
  }

  console.log(`- ${b.display_name}: posted ✓ "${content}"`);
}
