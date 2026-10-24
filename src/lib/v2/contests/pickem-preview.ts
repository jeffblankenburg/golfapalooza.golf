import type { SupabaseClient } from "@supabase/supabase-js";
import { coveringSide, type PickemGame } from "./pickem";
import { MATCHUP_SELECT, matchupToPickemGame, type MatchupRow } from "./pickem-server";

/** Compact per-game data for the admin contest-card accordion (both lanes). */
export interface PickemGamePreview {
  awayTeam: string;
  homeTeam: string;
  awayAbbrev: string | null;
  homeAbbrev: string | null;
  spread: number | null;
  favorite: "away" | "home" | null;
  gameTime: string | null;
  isTiebreaker: boolean;
  scored: boolean;                        // both scores in → completed
  winner: "away" | "home" | null;         // ATS covering side (null = push / unscored)
  pctCorrect: number | null;              // % of pickers who covered, once scored
  majoritySide: "away" | "home" | null;   // the crowd's pick before the game is scored
  majorityPct: number | null;             // % of pickers on the majority side
}

/**
 * Build the per-game preview rows for a set of Pick'em contests — matchups with the
 * line, the ATS covering side once scored, and the % of pickers who covered (or the
 * crowd's majority side before kickoff). Shared by the group Contests hub and the
 * event Contests list so both cards render identically.
 */
export async function buildPickemPreviews(
  supabase: SupabaseClient,
  contestIds: string[],
): Promise<Map<string, PickemGamePreview[]>> {
  const out = new Map<string, PickemGamePreview[]>();
  if (!contestIds.length) return out;

  const { data: rows } = await supabase
    .from("v2_matchups").select(MATCHUP_SELECT).in("contest_id", contestIds).order("sort_order");
  const gameRows = ((rows ?? []) as unknown as MatchupRow[]).map(matchupToPickemGame);
  const gameIds = gameRows.map((g) => g.id);

  const { data: picks } = gameIds.length
    ? await supabase.from("v2_picks").select("matchup_id, pick").in("matchup_id", gameIds)
    : { data: [] as { matchup_id: string; pick: { side?: "a" | "b" } | null }[] };

  const counts = new Map<string, { away: number; home: number }>();
  for (const p of picks ?? []) {
    const side = (p.pick as { side?: "a" | "b" } | null)?.side;
    if (!side) continue;
    const c = counts.get(p.matchup_id as string) ?? { away: 0, home: 0 };
    if (side === "a") c.away++; else c.home++;
    counts.set(p.matchup_id as string, c);
  }

  for (const g of gameRows) {
    const scored = g.away_score != null && g.home_score != null;
    const winner = scored ? coveringSide(g as unknown as PickemGame) : null;
    const c = counts.get(g.id) ?? { away: 0, home: 0 };
    const total = c.away + c.home;
    const covered = winner === "away" ? c.away : winner === "home" ? c.home : 0;
    const preview: PickemGamePreview = {
      awayTeam: g.away_team as string,
      homeTeam: g.home_team as string,
      awayAbbrev: (g.away_abbrev as string | null) ?? null,
      homeAbbrev: (g.home_abbrev as string | null) ?? null,
      spread: (g.spread as number | null) ?? null,
      favorite: (g.favorite as "away" | "home" | null) ?? null,
      gameTime: (g.game_time as string | null) ?? null,
      isTiebreaker: !!g.is_tiebreaker,
      scored,
      winner,
      pctCorrect: scored && total > 0 ? Math.round((covered / total) * 100) : null,
      majoritySide: total > 0 ? (c.away >= c.home ? "away" : "home") : null,
      majorityPct: total > 0 ? Math.round((Math.max(c.away, c.home) / total) * 100) : null,
    };
    (out.get(g.contest_id as string) || out.set(g.contest_id as string, []).get(g.contest_id as string)!).push(preview);
  }
  return out;
}
