// Test-only: fill a Squares pool end to end so it's ready to draw. Assigns all 100
// squares to the org's members (round-robin) AND sets the flexible payout
// allocations — every game a fixed $80 (Q1 $10 / Half $20 / Q3 $10 / Final $40)
// except the LAST game (by kickoff), which is "the rest" and splits the remainder
// by percent. Idempotent: re-running reassigns squares + re-writes allocations.
//
//   node scripts/seed-squares-entries.mjs [contestId]
//
// With no id it targets the most recently created squares pool.
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const structureOf = (league) =>
  league === "nba" || league === "nfl" || league === "college-football" ? "quarters" : league.includes("basketball") ? "halves" : "quarters";

// $80 fixed breakdown, in cents, per structure.
const FIXED_GAME = { kind: "amount", value: 8000 };
const FIXED_PERIODS = {
  quarters: { Q1: { kind: "amount", value: 1000 }, Half: { kind: "amount", value: 2000 }, Q3: { kind: "amount", value: 1000 }, Final: { kind: "amount", value: 4000 } },
  halves: { Half: { kind: "amount", value: 4000 }, Final: { kind: "amount", value: 4000 } },
};
// Remainder game: percentages (always sum to whatever's left).
const REST_GAME = { kind: "remainder", value: 0 };
const REST_PERIODS = {
  quarters: { Q1: { kind: "percent", value: 15 }, Half: { kind: "percent", value: 25 }, Q3: { kind: "percent", value: 15 }, Final: { kind: "percent", value: 45 } },
  halves: { Half: { kind: "percent", value: 40 }, Final: { kind: "percent", value: 60 } },
};

async function main() {
  // 1) Resolve the contest.
  let contestId = process.argv[2];
  if (!contestId) {
    const { data } = await sb.from("v2_contests").select("id, name, org_id, config").eq("contest_type", "squares").order("created_at", { ascending: false }).limit(1);
    if (!data?.length) { console.error("No squares contests found."); process.exit(1); }
    contestId = data[0].id;
  }
  const { data: contest, error: cErr } = await sb.from("v2_contests").select("id, name, org_id, config, contest_type").eq("id", contestId).maybeSingle();
  if (cErr || !contest || contest.contest_type !== "squares") { console.error("Squares contest not found:", contestId); process.exit(1); }
  console.log(`Pool: ${contest.name} (${contest.id})`);

  // 2) Members of the org.
  const { data: members } = await sb.from("v2_memberships").select("user_id").eq("org_id", contest.org_id).eq("status", "active");
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) { console.error("No active members in the org."); process.exit(1); }
  console.log(`Members: ${userIds.length}`);

  // 3) Allocations: last game (by kickoff, nulls last) = rest; all others $80 fixed.
  const { data: games } = await sb.from("v2_squares_games").select("id, label, league, start_time, sort_order").eq("contest_id", contest.id);
  const ordered = [...(games ?? [])].sort((a, b) => {
    const ax = a.start_time ?? "9999", bx = b.start_time ?? "9999";
    return ax === bx ? (a.sort_order ?? 0) - (b.sort_order ?? 0) : ax < bx ? -1 : 1;
  });
  for (let i = 0; i < ordered.length; i++) {
    const g = ordered[i];
    const s = structureOf(g.league);
    const isRest = i === ordered.length - 1;
    const game_alloc = isRest ? REST_GAME : FIXED_GAME;
    const period_alloc = isRest ? REST_PERIODS[s] : FIXED_PERIODS[s];
    const { error } = await sb.from("v2_squares_games").update({ game_alloc, period_alloc }).eq("id", g.id);
    if (error) { console.error(`alloc ${g.label}:`, error.message); process.exit(1); }
    console.log(`  ${g.label}: ${isRest ? "REST" : "$80"} (${s})`);
  }

  // 4) Fill all 100 squares round-robin across members.
  const { data: cells } = await sb.from("v2_squares_cells").select("id, grid_row, grid_col").eq("contest_id", contest.id).order("grid_row").order("grid_col");
  if (!cells?.length) { console.error("No cells for this pool."); process.exit(1); }
  const now = new Date().toISOString();
  let n = 0;
  await Promise.all(
    cells.map((c, i) => {
      const uid = userIds[i % userIds.length];
      n++;
      return sb.from("v2_squares_cells").update({ user_id: uid, purchased_at: now }).eq("id", c.id);
    }),
  );
  console.log(`Filled ${n}/${cells.length} squares.`);

  // 5) Report the resulting per-person counts + the current phase.
  const counts = {};
  cells.forEach((c, i) => { const uid = userIds[i % userIds.length]; counts[uid] = (counts[uid] ?? 0) + 1; });
  console.log(`Squares per member: ${Object.values(counts).join(", ")}`);
  console.log(`Phase: ${contest.config?.phase ?? "setup"} — draw numbers from the pool's admin page when ready.`);
}

main();
