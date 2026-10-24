import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateBracket, advanceWinner, teamWins, champion, runnerUp,
  type TournamentTeam, type TournamentGame,
} from "./tournament";

/**
 * Server wiring for the shared tournament substrate (#226): load a tournament's field +
 * bracket, create one, set its field, generate the single-elim structure, and record a
 * result (which advances the tree + eliminates the loser). Pure bracket math lives in
 * tournament.ts; this is the DB layer every consumer (bracket pool, auction) reads.
 */

const TEAM_SELECT = "id, espn_id, name, short_name, seed, region, logo_url, color, eliminated, play_in_slot";
const GAME_SELECT = "id, slot, round, region, game_number, team_a_id, team_b_id, next_game_id, advances_to_slot, start_time, external_ref, status, result";

export interface TournamentRow {
  id: string; org_id: string; sport: string; season: string | null; name: string;
  status: string; source: string; external_ref: Record<string, unknown> | null; config: Record<string, unknown> | null;
}

export interface TournamentSource {
  tournament: TournamentRow;
  teams: TournamentTeam[];
  games: TournamentGame[];
  teamById: Map<string, TournamentTeam>;
  teamWins: (teamId: string) => number;
  champion: () => string | null;
  runnerUp: () => string | null;
}

/** Load a tournament's field + bracket + derived reads. The single entry point every
 *  tournament-based contest uses (getField = teams, getBracket = games). */
export async function loadTournamentSource(admin: SupabaseClient, tournamentId: string): Promise<TournamentSource | null> {
  const { data: t } = await admin.from("v2_tournaments").select("id, org_id, sport, season, name, status, source, external_ref, config").eq("id", tournamentId).maybeSingle();
  if (!t) return null;
  const [{ data: teamRows }, { data: gameRows }] = await Promise.all([
    admin.from("v2_tournament_teams").select(TEAM_SELECT).eq("tournament_id", tournamentId).order("region").order("seed"),
    admin.from("v2_tournament_games").select(GAME_SELECT).eq("tournament_id", tournamentId).order("round").order("region").order("game_number"),
  ]);
  const teams = (teamRows ?? []) as unknown as TournamentTeam[];
  const games = (gameRows ?? []) as unknown as TournamentGame[];
  return {
    tournament: t as TournamentRow,
    teams,
    games,
    teamById: new Map(teams.map((x) => [x.id, x])),
    teamWins: (id) => teamWins(games, id),
    champion: () => champion(games),
    runnerUp: () => runnerUp(games),
  };
}

export async function createTournament(
  admin: SupabaseClient,
  input: { orgId: string; name: string; sport: string; season?: string | null; source?: "manual" | "espn"; createdBy: string },
): Promise<{ id: string }> {
  const { data, error } = await admin.from("v2_tournaments").insert({
    org_id: input.orgId, name: input.name, sport: input.sport, season: input.season ?? null,
    source: input.source ?? "manual", created_by: input.createdBy,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create tournament");
  return { id: data.id as string };
}

export interface FieldTeamInput {
  name: string; seed: number; region: string;
  espn_id?: string | null; short_name?: string | null; logo_url?: string | null; color?: string | null; play_in_slot?: string | null;
}

/** Replace the field (only before the structure is generated). */
export async function setTournamentField(admin: SupabaseClient, tournamentId: string, teams: FieldTeamInput[]): Promise<void> {
  await admin.from("v2_tournament_teams").delete().eq("tournament_id", tournamentId);
  if (!teams.length) return;
  const { error } = await admin.from("v2_tournament_teams").insert(
    teams.map((t) => ({
      tournament_id: tournamentId, name: t.name, seed: t.seed, region: t.region,
      espn_id: t.espn_id ?? null, short_name: t.short_name ?? null, logo_url: t.logo_url ?? null, color: t.color ?? null, play_in_slot: t.play_in_slot ?? null,
    })),
  );
  if (error) throw new Error(error.message);
}

/**
 * Generate the single-elim bracket from the current field: insert all games (slots +
 * R1 team assignments by region/seed), then wire next_game_id from each game's feeder
 * slot. Locks the tournament. Requires exactly 4 regions (March Madness shape).
 */
export async function generateStructure(admin: SupabaseClient, tournamentId: string): Promise<{ games: number }> {
  const { data: teamRows } = await admin.from("v2_tournament_teams").select("id, seed, region").eq("tournament_id", tournamentId);
  const teams = (teamRows ?? []) as { id: string; seed: number; region: string | null }[];
  const regions = [...new Set(teams.map((t) => t.region).filter((r): r is string => !!r))];
  if (regions.length !== 4) throw new Error(`A standard bracket needs exactly 4 regions (found ${regions.length}).`);

  const teamIdByRegionSeed = new Map(teams.map((t) => [`${t.region}:${t.seed}`, t.id]));
  const gen = generateBracket(regions);

  // Wipe any prior structure, then insert fresh.
  await admin.from("v2_tournament_games").delete().eq("tournament_id", tournamentId);
  const rows = gen.map((g) => ({
    tournament_id: tournamentId, slot: g.slot, round: g.round, region: g.region, game_number: g.game_number,
    team_a_id: g.team_a_seed != null && g.region ? teamIdByRegionSeed.get(`${g.region}:${g.team_a_seed}`) ?? null : null,
    team_b_id: g.team_b_seed != null && g.region ? teamIdByRegionSeed.get(`${g.region}:${g.team_b_seed}`) ?? null : null,
    advances_to_slot: g.advances_to_slot,
  }));
  const { data: inserted, error } = await admin.from("v2_tournament_games").insert(rows).select("id, slot");
  if (error) throw new Error(error.message);

  // Resolve next_game_id by slot now that ids exist.
  const idBySlot = new Map((inserted ?? []).map((r) => [r.slot as string, r.id as string]));
  const links = gen.filter((g) => g.next_slot).map((g) => ({ id: idBySlot.get(g.slot)!, next_game_id: idBySlot.get(g.next_slot!)! }));
  for (const l of links) await admin.from("v2_tournament_games").update({ next_game_id: l.next_game_id }).eq("id", l.id);

  await admin.from("v2_tournaments").update({ status: "locked", config: { regions }, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  return { games: rows.length };
}

/**
 * Record a game's result and advance the bracket: the winner fills the next game's slot,
 * the loser is eliminated. Idempotent-safe to re-run (recomputes advancement from the
 * stored tree). Pass winnerTeamId = null to clear (not yet supported — re-enter instead).
 */
export async function setGameResult(
  admin: SupabaseClient, tournamentId: string, gameId: string,
  input: { winnerTeamId: string; scoreA?: number | null; scoreB?: number | null },
): Promise<void> {
  const { data: gameRows } = await admin.from("v2_tournament_games").select(GAME_SELECT).eq("tournament_id", tournamentId);
  const games = (gameRows ?? []) as unknown as TournamentGame[];
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error("Game not found");
  if (game.team_a_id !== input.winnerTeamId && game.team_b_id !== input.winnerTeamId) throw new Error("Winner isn't in this game");

  await admin.from("v2_tournament_games").update({
    result: { winner_team_id: input.winnerTeamId, score_a: input.scoreA ?? null, score_b: input.scoreB ?? null },
    status: "final", updated_at: new Date().toISOString(),
  }).eq("id", gameId);

  const adv = advanceWinner(games, gameId, input.winnerTeamId);
  if (adv) {
    if (adv.nextGameId && adv.slot) {
      await admin.from("v2_tournament_games").update({ [adv.slot === "a" ? "team_a_id" : "team_b_id"]: adv.winnerTeamId, updated_at: new Date().toISOString() }).eq("id", adv.nextGameId);
    }
    if (adv.loserTeamId) await admin.from("v2_tournament_teams").update({ eliminated: true }).eq("id", adv.loserTeamId);
    // Final game → champion/runner-up are derived (champion()/runnerUp()); mark tournament final.
    if (!adv.nextGameId) await admin.from("v2_tournaments").update({ status: "final", updated_at: new Date().toISOString() }).eq("id", tournamentId);
  }
}
