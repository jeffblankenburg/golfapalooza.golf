#!/usr/bin/env node
// Seed 40 fake members into the "TKO Trivia" test group. These are throwaway
// test accounts that will NEVER log in — but v2_profiles.id references
// auth.users(id), so each one still needs an auth user (created via the admin
// API, same as scripts/create-al-pine.mjs).
//
// Fake members are tagged for easy identification / cleanup:
//   - auth user_metadata.fake = true
//   - reserved-for-fiction phone range +1 555 019 00NN
//   - email tko-fake-NN@tko-trivia.test
//
// Idempotent: re-running only creates members that don't already exist (keyed by
// the sentinel phone) and upserts each membership.
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// Usage: node scripts/seed-tko-fake-members.mjs [--dry-run]

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 40 fake members. nickname left null for most; set on a handful to exercise
// nickname-vs-real name display modes.
const PEOPLE = [
  ["Marcus", "Alvarado", null],
  ["Priya", "Banerjee", "Pri"],
  ["Derek", "Choi", null],
  ["Samantha", "Dillard", "Sam"],
  ["Tobias", "Egwuonwu", null],
  ["Grace", "Fontaine", null],
  ["Hector", "Guerrero", null],
  ["Naomi", "Hollis", null],
  ["Victor", "Ishikawa", "Vic"],
  ["Kayla", "Jennings", null],
  ["Rashad", "Kowalski", null],
  ["Delia", "Lindqvist", null],
  ["Oscar", "Mbeki", null],
  ["Fiona", "Nakamura", null],
  ["Desmond", "O'Rourke", "Des"],
  ["Lena", "Petrov", null],
  ["Amir", "Qureshi", null],
  ["Brooke", "Reyes", null],
  ["Caleb", "Sorensen", null],
  ["Monica", "Thibodeaux", "Mo"],
  ["Jonah", "Underwood", null],
  ["Talia", "Vasquez", null],
  ["Gavin", "Whitaker", null],
  ["Ingrid", "Xiong", null],
  ["Reuben", "Yamamoto", null],
  ["Celeste", "Zabala", null],
  ["Bennett", "Ashford", null],
  ["Harper", "Bello", null],
  ["Elliot", "Castellano", null],
  ["Nadia", "Dreyfus", null],
  ["Preston", "Eberhardt", null],
  ["Camila", "Furlong", "Cami"],
  ["Silas", "Grimaldi", null],
  ["Yvonne", "Haddad", null],
  ["Trevor", "Iannucci", null],
  ["Daria", "Jovanovic", null],
  ["Malik", "Keaton", null],
  ["Esme", "Laurent", null],
  ["Roland", "Mercado", null],
  ["Bianca", "Novak", null],
  // Second batch (2026-10-01) — added as members only, NOT marked attending.
  ["Garrett", "Okafor", null],
  ["Simone", "Pappas", null],
  ["Dominic", "Rinaldi", null],
  ["Aisha", "Sutton", null],
  ["Wesley", "Tran", null],
  ["Colette", "Ventura", null],
  ["Lorenzo", "Wade", null],
  ["Phoebe", "Yates", null],
  ["Travis", "Zimmerman", null],
  ["Renata", "Acosta", null],
];

const ORG_SLUG = "tko-trivia";
const ORG_NAME = "TKO Trivia";
const PHONE_PREFIX = "+1555019"; // +1 555-019-00NN — reserved-for-fiction range
const phoneFor = (i) => `${PHONE_PREFIX}${String(i + 1).padStart(4, "0")}`;
const emailFor = (i) => `tko-fake-${String(i + 1).padStart(2, "0")}@tko-trivia.test`;

// 1) Resolve the org.
const { data: org, error: orgErr } = await admin
  .from("v2_organizations")
  .select("id, name, slug")
  .or(`slug.eq.${ORG_SLUG},name.eq.${ORG_NAME}`)
  .maybeSingle();
if (orgErr) {
  console.error("Org lookup failed:", orgErr.message);
  process.exit(1);
}
if (!org) {
  console.error(`Couldn't find a group with slug "${ORG_SLUG}" or name "${ORG_NAME}".`);
  process.exit(1);
}
console.log(`Target group: ${org.name} (${org.slug}) ${org.id}`);

// 2) Which fake members already exist? (keyed by sentinel phone)
const { data: existing } = await admin
  .from("v2_profiles")
  .select("id, phone")
  .like("phone", `${PHONE_PREFIX}%`);
const idByPhone = new Map((existing || []).map((p) => [p.phone, p.id]));
console.log(`Found ${idByPhone.size} existing fake profile(s).`);

if (DRY_RUN) {
  const toCreate = PEOPLE.filter((_, i) => !idByPhone.has(phoneFor(i))).length;
  console.log(`[dry-run] Would create ${toCreate} member(s) and ensure ${PEOPLE.length} membership(s).`);
  process.exit(0);
}

let created = 0;
let reused = 0;
let failed = 0;

for (let i = 0; i < PEOPLE.length; i++) {
  const [first, last, nickname] = PEOPLE[i];
  const phone = phoneFor(i);
  const email = emailFor(i);
  const displayName = nickname || `${first} ${last}`;

  let userId = idByPhone.get(phone) || null;

  if (!userId) {
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { display_name: displayName, fake: true, fake_group: ORG_SLUG },
    });
    if (createErr || !createdUser?.user) {
      console.error(`  ✗ ${displayName}: auth createUser failed — ${createErr?.message}`);
      failed++;
      continue;
    }
    userId = createdUser.user.id;

    const { error: profErr } = await admin.from("v2_profiles").insert({
      id: userId,
      display_name: displayName,
      first_name: first,
      last_name: last,
      nickname: nickname,
      phone,
    });
    if (profErr) {
      console.error(`  ✗ ${displayName}: profile insert failed — ${profErr.message}`);
      failed++;
      continue;
    }
    created++;
  } else {
    reused++;
  }

  // Ensure the membership (idempotent).
  const { error: memErr } = await admin
    .from("v2_memberships")
    .upsert(
      { org_id: org.id, user_id: userId, role: "member", status: "active" },
      { onConflict: "org_id,user_id" }
    );
  if (memErr) {
    console.error(`  ✗ ${displayName}: membership upsert failed — ${memErr.message}`);
    failed++;
  }
}

console.log(`\n✓ Done. Created ${created}, reused ${reused}, failed ${failed}.`);
console.log(`  All ${PEOPLE.length - failed} are active members of ${org.name}.`);
if (failed) process.exit(1);
