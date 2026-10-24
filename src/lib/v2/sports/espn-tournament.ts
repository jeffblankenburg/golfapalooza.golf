import type { FieldTeamInput } from "@/lib/v2/contests/tournament-server";

/**
 * March Madness field importer (#226/#227). The full seeded field lives in the Round-1
 * scoreboard: each game's note headline carries the region ("… - East Region - 1st
 * Round") and each competitor's `curatedRank.current` is its 1–16 seed. We read the
 * Round-1 date(s), collect both competitors per game, and dedupe by ESPN team id.
 *
 * Verified live against the 2025 bracket (64 teams, 4 regions × 16). Men's/women's
 * college basketball only for now — NFL/NHL brackets are shaped differently (later
 * adapters). The admin reviews/edits the field after import (e.g. a First-Four slot not
 * yet resolved), then generates the bracket.
 */

const SPORT_PATH: Record<string, string> = {
  "mens-college-basketball": "basketball/mens-college-basketball",
  "womens-college-basketball": "basketball/womens-college-basketball",
};

export function supportsFieldImport(sport: string): boolean {
  return sport in SPORT_PATH;
}

interface RawCompetitor { curatedRank?: { current?: number }; team?: { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string; color?: string } }
interface RawEvent { competitions?: { notes?: { headline?: string }[]; competitors?: RawCompetitor[] }[] }

/** Pull the seeded field from ESPN's Round-1 scoreboard for the given YYYYMMDD date(s). */
export async function fetchBracketField(sport: string, dates: string[]): Promise<FieldTeamInput[]> {
  const path = SPORT_PATH[sport];
  if (!path) throw new Error("ESPN field import supports men's/women's college basketball for now.");

  const field = new Map<string, FieldTeamInput>();
  for (const date of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}&groups=50&limit=200`;
    let data: { events?: RawEvent[] };
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      data = await res.json();
    } catch { continue; }

    for (const e of data.events ?? []) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      const head = comp.notes?.[0]?.headline ?? "";
      if (!head.includes("1st Round")) continue; // Round 1 only — that's the full seeded field
      const region = head.match(/-\s*([\w\s]+?)\s+Region/)?.[1]?.trim();
      if (!region) continue;

      for (const c of comp.competitors ?? []) {
        const seed = c.curatedRank?.current;
        const t = c.team ?? {};
        if (!t.id || !seed) continue;
        if (!field.has(t.id)) {
          field.set(t.id, {
            espn_id: t.id,
            name: t.shortDisplayName || t.displayName || "Team",
            short_name: t.abbreviation ?? null,
            seed,
            region,
            logo_url: t.logo ?? null,
            color: t.color ? `#${t.color}` : null,
          });
        }
      }
    }
  }
  return [...field.values()];
}
