import type { FieldTeamInput } from "@/lib/v2/contests/tournament-server";
import { round1Position, firstFourSlot } from "@/lib/v2/contests/tournament";

/**
 * March Madness field importer (#226/#227). Two things come out of ESPN's Round-1 data:
 *
 *   1. The seeded field — each R1 scoreboard game's note headline carries the region
 *      ("… - East Region - 1st Round"), each competitor's `curatedRank.current` is its
 *      1–16 seed, and `records[overall].summary` is the season W-L record.
 *
 *   2. The region ARRANGEMENT (which region sits where in the bracket, and therefore
 *      which two regions meet in each Final Four semifinal). This is NOT guessable and is
 *      fixed by the committee on Selection Sunday, before any game is played. ESPN's core
 *      API exposes it per game as `competition.tournamentMatchup.bracketLocation` — a
 *      global 1..N bracket slot. The region whose games own the lowest slots sits at the
 *      top of the bracket. Ordering the four regions by their lowest bracketLocation gives
 *      the true top-to-bottom arrangement, and `generateBracket` pairs regions[0]&[1] into
 *      FF game 1 and regions[2]&[3] into FF game 2 — matching the committee's pairing.
 *
 * We only need one representative game per region to read its bracketLocation (the 1-vs-16
 * game is the region's first slot), so this costs four extra core-API fetches, not 32.
 *
 * Verified live against the 2025 men's bracket: field = 64 teams / 4 regions, and the
 * derived order [South, West, East, Midwest] matched the Elite 8 `winnerAdvancesTo`
 * pairing (South+West → FF1, East+Midwest → FF2). Men's/women's college basketball only
 * for now — other brackets are shaped differently (later adapters).
 */

const SPORT_PATH: Record<string, string> = {
  "mens-college-basketball": "basketball/mens-college-basketball",
  "womens-college-basketball": "basketball/womens-college-basketball",
};

export function supportsFieldImport(sport: string): boolean {
  return sport in SPORT_PATH;
}

export interface ImportedField {
  teams: FieldTeamInput[];
  /** The four regions in bracket order (top → bottom). Sets the Final Four pairing. */
  regionOrder: string[];
}

interface RawRecord { name?: string; type?: string; summary?: string }
interface RawCompetitor { curatedRank?: { current?: number }; records?: RawRecord[]; team?: { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string; color?: string } }
interface RawEvent { id?: string; competitions?: { notes?: { headline?: string }[]; competitors?: RawCompetitor[]; tournamentMatchup?: { bracketLocation?: number } }[] }

const REGION_RE = /-\s*([\w\s]+?)\s+Region/;
const overall = (records?: RawRecord[]) => records?.find((r) => r.name === "overall" || r.type === "total")?.summary ?? null;

/** Decrement a YYYYMMDD string by `n` days (for deriving First Four dates from R1). */
function decYmd(ymd: string, n: number): string {
  const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Core-API event path for the given site path (inserts `/leagues/`). */
function coreEventUrl(path: string, eventId: string): string {
  const [sport, league] = path.split("/");
  return `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${eventId}?lang=en&region=us`;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

/**
 * Pull the seeded field + region arrangement from ESPN's Round-1 scoreboard for the given
 * YYYYMMDD date(s). The admin can still review/edit the field before generating.
 */
export async function fetchBracketField(sport: string, dates: string[]): Promise<ImportedField> {
  const path = SPORT_PATH[sport];
  if (!path) throw new Error("ESPN field import supports men's/women's college basketball for now.");

  // R1 dates give the 60 locked seeds + the region arrangement; the two days before the
  // earliest R1 date are the First Four, which supply the 8 play-in teams (and are the
  // only place those teams appear when importing on Selection Sunday, before R1 is set).
  const r1Dates = [...new Set(dates)].sort();
  const earliest = r1Dates[0];
  const ffDates = earliest ? [decYmd(earliest, 2), decYmd(earliest, 1)] : [];

  const field = new Map<string, FieldTeamInput>();
  // One representative R1 event id per region (prefer the 1-seed game = the region's first
  // bracket slot) so we can read each region's bracketLocation from the core API.
  const regionAnchorEvent = new Map<string, { eventId: string; hasOneSeed: boolean }>();

  const addTeam = (c: RawCompetitor, region: string, playInSlot: string | null) => {
    const seed = c.curatedRank?.current;
    const t = c.team ?? {};
    if (!t.id || !seed) return;
    if (field.has(t.id)) return; // First Four pass runs first; keep its play-in marker
    field.set(t.id, {
      espn_id: t.id,
      name: t.shortDisplayName || t.displayName || "Team",
      short_name: t.abbreviation ?? null,
      seed,
      region,
      logo_url: t.logo ?? null,
      color: t.color ? `#${t.color}` : null,
      record: overall(c.records),
      play_in_slot: playInSlot,
    });
  };

  const scan = async (date: string) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}&groups=50&limit=200`;
    return (await getJson<{ events?: RawEvent[] }>(url))?.events ?? [];
  };

  // First Four first, so play-in teams are marked before R1 would re-add the winner.
  for (const date of ffDates) {
    for (const e of await scan(date)) {
      const comp = e.competitions?.[0];
      const head = comp?.notes?.[0]?.headline ?? "";
      if (!comp || !head.includes("First Four")) continue;
      const region = head.match(REGION_RE)?.[1]?.trim();
      if (!region) continue;
      // Both contestants share a seed; the winner fills that seed's R1 side.
      const seed = (comp.competitors ?? []).map((c) => c.curatedRank?.current).find((s): s is number => !!s);
      const pos = seed ? round1Position(seed) : null;
      const slot = pos ? firstFourSlot(region, pos.gameNumber) : null;
      for (const c of comp.competitors ?? []) addTeam(c, region, slot);
    }
  }

  // Round 1 — the rest of the field + the region arrangement anchors.
  for (const date of r1Dates) {
    for (const e of await scan(date)) {
      const comp = e.competitions?.[0];
      const head = comp?.notes?.[0]?.headline ?? "";
      if (!comp || !head.includes("1st Round")) continue;
      const region = head.match(REGION_RE)?.[1]?.trim();
      if (!region) continue;

      const seeds = (comp.competitors ?? []).map((c) => c.curatedRank?.current).filter((s): s is number => !!s);
      const hasOneSeed = seeds.includes(1);
      const prior = regionAnchorEvent.get(region);
      if (e.id && (!prior || (hasOneSeed && !prior.hasOneSeed))) regionAnchorEvent.set(region, { eventId: e.id, hasOneSeed });

      for (const c of comp.competitors ?? []) addTeam(c, region, null);
    }
  }

  const regionOrder = await deriveRegionOrder(path, regionAnchorEvent);
  return { teams: [...field.values()], regionOrder };
}

/**
 * Resolve the bracket arrangement: fetch each region's anchor game from the core API, read
 * its `tournamentMatchup.bracketLocation`, and sort regions ascending. Falls back to the
 * order the regions were first seen if ESPN's structural data is unavailable (so import
 * still succeeds; the admin can reorder before generating).
 */
async function deriveRegionOrder(path: string, anchors: Map<string, { eventId: string }>): Promise<string[]> {
  const seenOrder = [...anchors.keys()];
  const located = await Promise.all(
    [...anchors.entries()].map(async ([region, { eventId }]) => {
      const ev = await getJson<RawEvent>(coreEventUrl(path, eventId));
      const loc = ev?.competitions?.[0]?.tournamentMatchup?.bracketLocation;
      return { region, loc: typeof loc === "number" ? loc : null };
    }),
  );
  const allLocated = located.every((x) => x.loc !== null);
  if (!allLocated) return seenOrder;
  return located.sort((a, b) => (a.loc! - b.loc!)).map((x) => x.region);
}
