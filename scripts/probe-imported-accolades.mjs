#!/usr/bin/env node
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: rows, count } = await admin
  .from("accolades")
  .select("category, trip_id, user_id, partner_user_id", { count: "exact" });

const byCategory = {};
for (const r of rows ?? []) {
  byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
}
console.log(`Total accolades rows: ${count}`);
console.log("By category:", byCategory);

const { count: matchedUsers } = await admin
  .from("users")
  .select("*", { count: "exact", head: true })
  .not("workbook_name", "is", null);
console.log(`Users with workbook_name set: ${matchedUsers}`);

const { count: tripCount } = await admin
  .from("trip_settings")
  .select("*", { count: "exact", head: true });
console.log(`Total trips in DB: ${tripCount}`);
