/**
 * ESPN scoreboard client (#223 / #230). Reads the public ESPN scoreboard API
 * (no key) for a league + date and normalizes events into a small, stable shape
 * used by the game picker (selecting games for a contest) and later by grading
 * (results + per-period linescores auto-matched by team id + date).
 *
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard
 */

/** How a game is divided for Boxes payouts — NCAA hoops plays two halves; the NBA
 *  and both footballs play four quarters. Drives the period presets. */
export type PeriodStructure = "halves" | "quarters";

export interface League {
  key: string; // our stable id, stored on the contest
  label: string;
  path: string; // ESPN sport/league path segment
  groups?: string; // ESPN "groups" filter (e.g. D-I college)
  periods: PeriodStructure;
  scoring: "basketball" | "football"; // typical scoring increments (UI convenience)
}

/** Leagues we can pull games for. Add more by appending a row — no other change. */
export const LEAGUES: League[] = [
  { key: "mens-college-basketball", label: "NCAA Men's Basketball", path: "basketball/mens-college-basketball", groups: "50", periods: "halves", scoring: "basketball" },
  { key: "womens-college-basketball", label: "NCAA Women's Basketball", path: "basketball/womens-college-basketball", groups: "50", periods: "halves", scoring: "basketball" },
  { key: "nba", label: "NBA", path: "basketball/nba", periods: "quarters", scoring: "basketball" },
  { key: "nfl", label: "NFL", path: "football/nfl", periods: "quarters", scoring: "football" },
  { key: "college-football", label: "College Football", path: "football/college-football", groups: "80", periods: "quarters", scoring: "football" },
];

export function getLeague(key: string): League | undefined {
  return LEAGUES.find((l) => l.key === key);
}

export interface EspnCompetitor {
  espnId: string;
  name: string; // display name
  abbrev: string;
  logo: string | null;
  color: string | null; // "#RRGGBB"
  homeAway: "home" | "away";
  score: number | null;
}

export interface EspnGame {
  espnEventId: string;
  league: string; // league key
  shortName: string; // "SEA @ DEN"
  startTime: string; // ISO
  state: "pre" | "in" | "post";
  statusDetail: string; // "Fri 8:15 PM", "Final", "Q3 4:12"
  tv: string | null;
  home: EspnCompetitor | null;
  away: EspnCompetitor | null;
  spread?: number | null; // points the favorite is favored by (ESPN odds), if offered
  favorite?: "home" | "away" | null;
}

type RawTeam = { id?: string | number; displayName?: string; name?: string; abbreviation?: string; logo?: string; color?: string };
type RawCompetitor = { homeAway?: string; score?: string | number; team?: RawTeam };
type RawStatus = { type?: { state?: string; shortDetail?: string } };
type RawOdds = {
  details?: string; // e.g. "DEN -3.5" or "EVEN"
  spread?: number;
  homeTeamOdds?: { favorite?: boolean };
  awayTeamOdds?: { favorite?: boolean };
};
type RawEvent = {
  id?: string | number;
  date?: string;
  shortName?: string;
  status?: RawStatus;
  competitions?: { competitors?: RawCompetitor[]; status?: RawStatus; broadcasts?: { names?: string[] }[]; odds?: RawOdds[] }[];
};

/** Pull the spread (magnitude) + which side is favored from ESPN's odds block.
 *  Prefers the explicit favorite flags, then the details abbrev, then spread sign. */
function parseOdds(odds: RawOdds | undefined, home: { abbrev?: string } | null, away: { abbrev?: string } | null): { spread: number | null; favorite: "home" | "away" | null } {
  if (!odds) return { spread: null, favorite: null };
  const details = (odds.details ?? "").trim();
  if (details.toUpperCase() === "EVEN" || odds.spread === 0) return { spread: 0, favorite: null };

  let favorite: "home" | "away" | null =
    odds.homeTeamOdds?.favorite ? "home" : odds.awayTeamOdds?.favorite ? "away" : null;
  if (!favorite && details) {
    const favAbbr = details.split(/\s+/)[0]?.toUpperCase();
    if (favAbbr && home?.abbrev && home.abbrev.toUpperCase() === favAbbr) favorite = "home";
    else if (favAbbr && away?.abbrev && away.abbrev.toUpperCase() === favAbbr) favorite = "away";
  }
  if (!favorite && typeof odds.spread === "number" && odds.spread !== 0) {
    favorite = odds.spread < 0 ? "home" : "away"; // ESPN spread is home-relative
  }

  let spread: number | null = typeof odds.spread === "number" ? Math.abs(odds.spread) : null;
  if (spread == null && details) {
    const m = details.match(/-?\d+(\.\d+)?/);
    if (m) spread = Math.abs(parseFloat(m[0]));
  }
  return { spread, favorite };
}

function competitor(c: RawCompetitor): EspnCompetitor {
  const t = c.team ?? {};
  return {
    espnId: String(t.id ?? ""),
    name: t.displayName ?? t.name ?? t.abbreviation ?? "TBD",
    abbrev: t.abbreviation ?? "",
    logo: t.logo ?? null,
    color: t.color ? `#${t.color}` : null,
    homeAway: c.homeAway === "home" ? "home" : "away",
    score: c.score != null && c.score !== "" ? Number(c.score) : null,
  };
}

function normalize(league: string, ev: RawEvent): EspnGame | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const competitors = (comp.competitors ?? []).map(competitor);
  const home = competitors.find((c) => c.homeAway === "home") ?? null;
  const away = competitors.find((c) => c.homeAway === "away") ?? null;
  const status = comp.status ?? ev.status;
  const state = status?.type?.state;
  const { spread, favorite } = parseOdds(comp.odds?.[0], home, away);
  return {
    espnEventId: String(ev.id ?? ""),
    league,
    shortName: ev.shortName ?? `${away?.abbrev ?? "?"} @ ${home?.abbrev ?? "?"}`,
    startTime: ev.date ?? "",
    state: state === "in" || state === "post" ? state : "pre",
    statusDetail: status?.type?.shortDetail ?? "",
    tv: comp.broadcasts?.[0]?.names?.[0] ?? null,
    home,
    away,
    spread,
    favorite,
  };
}

export interface SideScore {
  abbrev: string;
  /** Cumulative score through each period that is COMPLETE (null while in play). */
  cum: (number | null)[];
  /** Current running score at this instant (mid-period included); null pre-game. */
  current: number | null;
  total: number | null; // final score, set only when the game is over
}
export interface GameScore {
  state: "pre" | "in" | "post";
  detail: string;
  away: SideScore | null;
  home: SideScore | null;
  spread: number | null; // the line, from the summary's pickcenter (survives after final)
  favorite: "home" | "away" | null;
}

type RawSummary = {
  header?: { competitions?: { status?: RawStatus; competitors?: (RawCompetitor & { linescores?: { value?: number; displayValue?: string }[] })[] }[] };
  pickcenter?: RawOdds[]; // betting lines; persists for past games (scoreboard drops them)
};

/**
 * A single game's live/final scores by ESPN event id (no date needed). Returns
 * per-period CUMULATIVE scores (a period is only filled in once it's complete),
 * plus the final total when the game is over — the inputs the payout sheet needs.
 */
export async function fetchGameScore(leagueKey: string, eventId: string): Promise<GameScore | null> {
  const lg = getLeague(leagueKey);
  if (!lg) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/summary?event=${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as RawSummary;
  const comp = data.header?.competitions?.[0];
  if (!comp) return null;
  const raw = comp.status?.type?.state;
  const state: GameScore["state"] = raw === "in" || raw === "post" ? raw : "pre";
  const detail = comp.status?.type?.shortDetail ?? "";

  const side = (ha: "home" | "away"): SideScore | null => {
    const c = (comp.competitors ?? []).find((x) => x.homeAway === ha);
    if (!c) return null;
    const ls = (c.linescores ?? []).map((l) => Number(l.value ?? l.displayValue ?? 0));
    const cum: (number | null)[] = [];
    let run = 0;
    for (let i = 0; i < ls.length; i++) {
      run += ls[i];
      // The last linescore is the in-progress period unless the game is final.
      const complete = state === "post" || i < ls.length - 1;
      cum.push(complete ? run : null);
    }
    const total = state === "post" ? Number(c.score ?? run) : null;
    const current = c.score != null && c.score !== "" ? Number(c.score) : state === "pre" ? null : run;
    return { abbrev: c.team?.abbreviation ?? "", cum, current, total };
  };

  const away = side("away");
  const home = side("home");
  const { spread, favorite } = parseOdds(data.pickcenter?.[0], home, away);
  return { state, detail, away, home, spread, favorite };
}

/** Map an ESPN game score onto our period keys for a structure (quarters/halves). */
export function periodScoresFromGame(score: GameScore, structure: PeriodStructure): Record<string, { away: number; home: number } | null> {
  const idx: Record<string, number> = structure === "quarters" ? { Q1: 0, Half: 1, Q3: 2 } : { Half: 0 };
  const out: Record<string, { away: number; home: number } | null> = {};
  for (const key in idx) {
    const i = idx[key];
    const a = score.away?.cum[i];
    const h = score.home?.cum[i];
    out[key] = a != null && h != null ? { away: a, home: h } : null;
  }
  out.Final = score.away?.total != null && score.home?.total != null ? { away: score.away.total, home: score.home.total } : null;
  return out;
}

/**
 * Games for a league on a date (YYYYMMDD; omit for ESPN's current slate).
 * Throws on a non-OK response so callers can surface a clean error.
 */
export async function fetchScoreboard(leagueKey: string, date?: string): Promise<EspnGame[]> {
  const lg = getLeague(leagueKey);
  if (!lg) throw new Error(`Unknown league: ${leagueKey}`);
  const params = new URLSearchParams({ limit: "400" });
  if (date) params.set("dates", date);
  if (lg.groups) params.set("groups", lg.groups);
  const url = `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard?${params.toString()}`;

  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as { events?: RawEvent[] };
  return (data.events ?? [])
    .map((e) => normalize(leagueKey, e))
    .filter((g): g is EspnGame => g !== null)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
