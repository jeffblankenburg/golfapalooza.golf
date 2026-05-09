#!/usr/bin/env node
// Why does the cost_item-driven enrollment see only 1 funder when the
// legacy enrollment sees 38? Show, per contest, the entire chain:
//   contest → buy_in_cost_item → linked_option → choice filter → matching selections

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

const { data: contests } = await admin
  .from("contests")
  .select("id, name, buy_in_cost_item_id, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(id, name, linked_option_id, linked_option:trip_options(id, name, option_type), choices:cost_item_option_choices(choice_value))")
  .eq("trip_id", trip.id)
  .not("buy_in_cost_item_id", "is", null)
  .order("name");

const { data: allSelections } = await admin
  .from("user_option_selections")
  .select("option_id, user_id, value");

const selByOption = new Map();
for (const s of allSelections || []) {
  if (!selByOption.has(s.option_id)) selByOption.set(s.option_id, []);
  selByOption.get(s.option_id).push(s);
}

for (const c of contests) {
  const item = Array.isArray(c.buy_in_cost_item) ? c.buy_in_cost_item[0] : c.buy_in_cost_item;
  if (!item) {
    console.log(`${c.name.padEnd(28)}  (no cost_item)`);
    continue;
  }
  const opt = Array.isArray(item.linked_option) ? item.linked_option[0] : item.linked_option;
  const choices = item.choices || [];
  const choiceFilter = choices.length > 0 ? choices.map((x) => x.choice_value).join(",") : "(any non-zero)";

  const { count: enrolled } = await admin
    .from("contest_participants")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", c.id);

  const optionSelectionCount = opt ? (selByOption.get(opt.id) || []).length : 0;

  console.log(`${c.name.padEnd(28)}  enrolled=${enrolled ?? 0}`);
  console.log(`  cost_item: ${item.name}`);
  console.log(`  → option : ${opt ? `${opt.name} (${opt.option_type})` : "(no link!)"}`);
  console.log(`  → filter : ${choiceFilter}`);
  if (opt) {
    console.log(`  → ${optionSelectionCount} total selections on that option`);
    // Show distribution of values
    const values = (selByOption.get(opt.id) || []).map((s) => JSON.stringify(s.value));
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const distrib = Object.entries(counts).map(([v, n]) => `${v}×${n}`).join(", ");
    console.log(`  → values : ${distrib || "(none)"}`);
  }
  console.log("");
}
