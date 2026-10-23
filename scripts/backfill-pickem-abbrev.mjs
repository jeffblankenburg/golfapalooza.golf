// One-off: backfill away_abbrev/home_abbrev on existing v2_pickem_games from ESPN.
// Games added before migration 00278 stored only full team names; this fills the
// short codes so compact matchup/spread labels can use them. Idempotent: only
// touches rows that have an espn_event_id and are still missing an abbreviation.
//
//   node scripts/backfill-pickem-abbrev.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Minimal .env.local parse (no dotenv dependency), same pattern as sibling scripts.
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// league key → ESPN sport/league path (mirror of src/lib/v2/sports/espn.ts LEAGUES).
const LEAGUE_PATH = {
  "mens-college-basketball": "basketball/mens-college-basketball",
  "womens-college-basketball": "basketball/womens-college-basketball",
  "nba": "basketball/nba",
  "nfl": "football/nfl",
  "college-football": "football/college-football",
};

async function abbrevsFor(league, eventId) {
  const path = LEAGUE_PATH[league];
  if (!path) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  const comps = data?.header?.competitions?.[0]?.competitors ?? [];
  const pick = (ha) => comps.find((c) => c.homeAway === ha)?.team?.abbreviation || null;
  return { away: pick("away"), home: pick("home") };
}

const { data: games, error } = await sb
  .from("v2_pickem_games")
  .select("id, league, espn_event_id, away_team, home_team, away_abbrev, home_abbrev")
  .not("espn_event_id", "is", null)
  .or("away_abbrev.is.null,home_abbrev.is.null");
if (error) { console.error(error); process.exit(1); }

console.log(`${games.length} game(s) missing an abbreviation.`);
let filled = 0;
for (const g of games) {
  const ab = await abbrevsFor(g.league, g.espn_event_id);
  if (!ab || (!ab.away && !ab.home)) { console.log(`  skip ${g.away_team} @ ${g.home_team} (no ESPN data)`); continue; }
  const patch = {};
  if (!g.away_abbrev && ab.away) patch.away_abbrev = ab.away;
  if (!g.home_abbrev && ab.home) patch.home_abbrev = ab.home;
  if (!Object.keys(patch).length) continue;
  const { error: upErr } = await sb.from("v2_pickem_games").update(patch).eq("id", g.id);
  if (upErr) { console.error(`  FAIL ${g.id}:`, upErr.message); continue; }
  filled++;
  console.log(`  ${g.away_team} @ ${g.home_team} → ${patch.away_abbrev ?? g.away_abbrev} @ ${patch.home_abbrev ?? g.home_abbrev}`);
}
console.log(`Done. Updated ${filled} game(s).`);
