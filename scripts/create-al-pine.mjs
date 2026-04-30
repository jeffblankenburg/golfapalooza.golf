#!/usr/bin/env node
// One-shot provisioning script for the "Al Pine" system bot. Idempotent —
// running it twice is safe; it only creates rows that don't already exist.
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
// (already in .env.local for the dev environment, in Vercel project settings
// for prod).
//
// Usage: node scripts/create-al-pine.mjs

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DISPLAY_NAME = "Al Pine";
const FULL_NAME = "Al Pine";
const SENTINEL_EMAIL = "al-pine@golfapalooza.local";
const SENTINEL_PHONE = "+10000000001";
const AVATAR_URL = "/alpine.png";

// 1. Look up an existing public.users row by display_name (cheapest probe).
const { data: existingPublic } = await admin
  .from("users")
  .select("id, display_name, is_system, avatar_url")
  .eq("display_name", DISPLAY_NAME)
  .maybeSingle();

let userId = existingPublic?.id ?? null;

if (userId) {
  console.log(`Found existing public.users row for "${DISPLAY_NAME}" (${userId})`);
} else {
  // 2. Create the auth user. The admin API auto-confirms email so the row
  //    can be referenced from public.users immediately.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: SENTINEL_EMAIL,
    phone: SENTINEL_PHONE,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { display_name: DISPLAY_NAME, system: true },
  });
  if (createErr) {
    console.error("auth.admin.createUser failed:", createErr.message);
    process.exit(1);
  }
  userId = created.user.id;
  console.log(`Created auth user ${userId}`);

  // 3. Insert the matching public.users row.
  const { error: insErr } = await admin.from("users").insert({
    id: userId,
    phone: SENTINEL_PHONE,
    display_name: DISPLAY_NAME,
    full_name: FULL_NAME,
    avatar_url: AVATAR_URL,
    is_active: false,
    is_system: true,
  });
  if (insErr) {
    console.error("public.users insert failed:", insErr.message);
    process.exit(1);
  }
  console.log(`Inserted public.users row for ${DISPLAY_NAME}`);
}

// 4. Reconcile flags + avatar in case the row pre-existed without them.
const { error: updErr } = await admin
  .from("users")
  .update({ is_system: true, is_active: false, avatar_url: AVATAR_URL })
  .eq("id", userId);
if (updErr) {
  console.error("Reconciliation update failed:", updErr.message);
  process.exit(1);
}

console.log(`✓ Al Pine ready as system user: ${userId}`);
