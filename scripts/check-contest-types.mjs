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

const { data: trip } = await admin.from("trip_settings").select("id").eq("status", "active").single();
const { data: rows } = await admin
  .from("payout_sheet_events")
  .select("label, winner_source, winner_day_number, contest:contests(name, contest_type, day_number)")
  .eq("trip_id", trip.id)
  .order("sort_order");

for (const r of rows) {
  const c = Array.isArray(r.contest) ? r.contest[0] : r.contest;
  console.log(
    r.label.padEnd(28),
    `winner_source=${(r.winner_source || "").padEnd(15)}`,
    `winner_day=${r.winner_day_number ?? "-"}`,
    `→ contest_type=${(c?.contest_type || "").padEnd(15)}`,
    `contest_day=${c?.day_number ?? "-"}`,
  );
}
