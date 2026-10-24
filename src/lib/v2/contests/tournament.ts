/**
 * Shared tournament substrate (#226) — pure structure + advancement + derived reads
 * for a seeded single-elimination bracket. Storage lives in v2_tournament_* ; the
 * server wiring (create / grade / advance appliers) sits in the admin layer. Ported
 * from bromadness `src/lib/bracket/generate.ts` (ROUND1_MATCHUPS + buildGameLinks),
 * adapted to deterministic `slot` keys so the tree can be inserted then linked.
 *
 * Every consumer reads through here: the bracket pool (slot picks), the auction (#227:
 * teamWins + champion/runnerUp), brocket, survivor. One tournament, many contests.
 */

export interface TournamentTeam {
  id: string;
  espn_id: string | null;
  name: string;
  short_name: string | null;
  seed: number;
  region: string | null;
  logo_url: string | null;
  color: string | null;
  eliminated: boolean;
  play_in_slot: string | null;
}

export interface TournamentGameResult {
  winner_team_id: string | null;
  score_a: number | null;
  score_b: number | null;
}

export interface TournamentGame {
  id: string;
  slot: string;
  round: number;
  region: string | null;
  game_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  next_game_id: string | null;
  advances_to_slot: "a" | "b" | null;
  start_time: string | null;
  external_ref: { espn_event_id?: string | null } | null;
  status: string;
  result: TournamentGameResult | null;
}

/** A game produced by generateBracket, before DB ids exist. R1 games carry the seed
 *  pairing (resolved to team ids at insert); later rounds fill from results. `next_slot`
 *  is resolved to `next_game_id` after insert. */
export interface GeneratedGame {
  slot: string;
  round: number;
  region: string | null;
  game_number: number;
  team_a_seed: number | null;
  team_b_seed: number | null;
  next_slot: string | null;
  advances_to_slot: "a" | "b" | null;
}

/** Round-1 seed pairings, in bracket order (bromadness parity). */
export const ROUND1_MATCHUPS: [number, number][] = [
  [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
];

const regionalSlot = (round: number, region: string, gameNum: number) => `r${round}:${region}:${gameNum}`;
const FF1 = "r5:ff1", FF2 = "r5:ff2", FINAL = "r6:final";

/**
 * Generate the full single-elim structure for a 4-region × 16-seed bracket (March
 * Madness shape). `regions` is the ordered list of 4 region names (order sets the Final
 * Four pairing: regions 1&2 meet in FF game 1, 3&4 in FF game 2). Returns all 63 games
 * with deterministic slots + their feeder links; R1 games carry the seed pairing.
 */
export function generateBracket(regions: string[]): GeneratedGame[] {
  if (regions.length !== 4) throw new Error("generateBracket expects exactly 4 regions");
  const games: GeneratedGame[] = [];
  const g = (slot: string, round: number, region: string | null, gameNumber: number, aSeed: number | null, bSeed: number | null): GeneratedGame =>
    ({ slot, round, region, game_number: gameNumber, team_a_seed: aSeed, team_b_seed: bSeed, next_slot: null, advances_to_slot: null });

  // Rounds 1–4 (regional).
  for (const region of regions) {
    for (let n = 1; n <= 8; n++) games.push(g(regionalSlot(1, region, n), 1, region, n, ROUND1_MATCHUPS[n - 1][0], ROUND1_MATCHUPS[n - 1][1]));
    for (let n = 1; n <= 4; n++) games.push(g(regionalSlot(2, region, n), 2, region, n, null, null));
    for (let n = 1; n <= 2; n++) games.push(g(regionalSlot(3, region, n), 3, region, n, null, null));
    games.push(g(regionalSlot(4, region, 1), 4, region, 1, null, null));
  }
  // Final Four + Championship.
  games.push(g(FF1, 5, null, 1, null, null), g(FF2, 5, null, 2, null, null), g(FINAL, 6, null, 1, null, null));

  // Wire feeders: each game's winner advances into next_slot's 'a' or 'b'.
  const bySlot = new Map(games.map((x) => [x.slot, x]));
  const link = (fromSlot: string, toSlot: string, slot: "a" | "b") => {
    const f = bySlot.get(fromSlot);
    if (f) { f.next_slot = toSlot; f.advances_to_slot = slot; }
  };
  for (const region of regions) {
    // R1→R2, R2→R3 (pairs of games feed one), R3→R4.
    for (let i = 0; i < 8; i += 2) { const to = regionalSlot(2, region, i / 2 + 1); link(regionalSlot(1, region, i + 1), to, "a"); link(regionalSlot(1, region, i + 2), to, "b"); }
    for (let i = 0; i < 4; i += 2) { const to = regionalSlot(3, region, i / 2 + 1); link(regionalSlot(2, region, i + 1), to, "a"); link(regionalSlot(2, region, i + 2), to, "b"); }
    link(regionalSlot(3, region, 1), regionalSlot(4, region, 1), "a");
    link(regionalSlot(3, region, 2), regionalSlot(4, region, 1), "b");
  }
  // R4→FF (regions 1&2 → ff1; 3&4 → ff2), FF→Championship.
  link(regionalSlot(4, regions[0], 1), FF1, "a");
  link(regionalSlot(4, regions[1], 1), FF1, "b");
  link(regionalSlot(4, regions[2], 1), FF2, "a");
  link(regionalSlot(4, regions[3], 1), FF2, "b");
  link(FF1, FINAL, "a");
  link(FF2, FINAL, "b");
  return games;
}

export interface AdvanceInstruction {
  nextGameId: string | null;
  slot: "a" | "b" | null;   // which team slot of next game to fill
  winnerTeamId: string;
  loserTeamId: string | null;
}

/**
 * When a game finalizes, compute how the bracket advances: the winner fills next_game's
 * slot; the loser is eliminated. Pure — the caller applies the DB writes.
 */
export function advanceWinner(games: TournamentGame[], gameId: string, winnerTeamId: string): AdvanceInstruction | null {
  const game = games.find((g) => g.id === gameId);
  if (!game) return null;
  const loserTeamId = game.team_a_id === winnerTeamId ? game.team_b_id : game.team_a_id;
  return { nextGameId: game.next_game_id, slot: game.advances_to_slot, winnerTeamId, loserTeamId };
}

/** How many games a team has won (the auction's seed-scoring input: Σ seed × wins). */
export function teamWins(games: TournamentGame[], teamId: string): number {
  return games.filter((g) => g.result?.winner_team_id === teamId).length;
}

const finalGame = (games: TournamentGame[]): TournamentGame | null => {
  if (!games.length) return null;
  const maxRound = Math.max(...games.map((g) => g.round));
  return games.find((g) => g.round === maxRound) ?? null;
};

/** The tournament champion's team id, once the final is scored. */
export function champion(games: TournamentGame[]): string | null {
  return finalGame(games)?.result?.winner_team_id ?? null;
}

/** The runner-up's team id (the finalist who lost the final). */
export function runnerUp(games: TournamentGame[]): string | null {
  const f = finalGame(games);
  const champ = f?.result?.winner_team_id;
  if (!f || !champ) return null;
  return f.team_a_id === champ ? f.team_b_id : f.team_a_id;
}
