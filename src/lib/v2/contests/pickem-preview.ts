import type { SupabaseClient } from "@supabase/supabase-js";
import { coveringSide, type PickemGame } from "./pickem";

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

  const { data: games } = await supabase
    .from("v2_pickem_games")
    .select("id, contest_id, away_team, home_team, away_abbrev, home_abbrev, spread, favorite, away_score, home_score, winning_team, game_time, is_tiebreaker, sort_order")
    .in("contest_id", contestIds)
    .order("sort_order");
  const gameRows = games ?? [];
  const gameIds = gameRows.map((g) => g.id as string);

  const { data: picks } = gameIds.length
    ? await supabase.from("v2_pickem_picks").select("game_id, picked_team").in("game_id", gameIds).not("picked_team", "is", null)
    : { data: [] as { game_id: string; picked_team: string }[] };

  const counts = new Map<string, { away: number; home: number }>();
  for (const p of picks ?? []) {
    const c = counts.get(p.game_id as string) ?? { away: 0, home: 0 };
    if (p.picked_team === "away") c.away++; else if (p.picked_team === "home") c.home++;
    counts.set(p.game_id as string, c);
  }

  for (const g of gameRows) {
    const scored = g.away_score != null && g.home_score != null;
    const winner = scored ? coveringSide(g as unknown as PickemGame) : null;
    const c = counts.get(g.id as string) ?? { away: 0, home: 0 };
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
