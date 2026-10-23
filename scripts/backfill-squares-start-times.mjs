// One-off: backfill v2_squares_games.start_time from ESPN for games picked before
// start_time was threaded through (#230). Reads each game's ESPN summary (which
// carries the kickoff date) and fills start_time where NULL. Idempotent.
//   node scripts/backfill-squares-start-times.mjs
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const LEAGUE_PATH = {
  "mens-college-basketball": "basketball/mens-college-basketball",
  "womens-college-basketball": "basketball/womens-college-basketball",
  nba: "basketball/nba",
  nfl: "football/nfl",
  "college-football": "football/college-football",
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: games, error } = await sb
  .from("v2_squares_games")
  .select("id, league, espn_event_id, start_time")
  .is("start_time", null)
  .not("espn_event_id", "is", null);
if (error) { console.error(error.message); process.exit(1); }
console.log(`${games?.length ?? 0} games missing start_time`);

let filled = 0;
for (const g of games ?? []) {
  const path = LEAGUE_PATH[g.league];
  if (!path) { console.log(`skip ${g.id} (unknown league ${g.league})`); continue; }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${g.espn_event_id}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) { console.log(`skip ${g.id} (ESPN ${res.status})`); continue; }
    const data = await res.json();
    const date = data?.header?.competitions?.[0]?.date;
    if (!date) { console.log(`skip ${g.id} (no date)`); continue; }
    const { error: upErr } = await sb.from("v2_squares_games").update({ start_time: date }).eq("id", g.id);
    if (upErr) { console.log(`fail ${g.id}: ${upErr.message}`); continue; }
    filled += 1;
    console.log(`set ${g.id} -> ${date}`);
  } catch (e) {
    console.log(`err ${g.id}: ${e.message}`);
  }
}
console.log(`done: ${filled} filled`);
