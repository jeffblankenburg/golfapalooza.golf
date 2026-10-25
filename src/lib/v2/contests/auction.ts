/**
 * Auction contest (#227) — pure logic. Participants bid a salary cap of fake money to
 * own entities (a shared tournament's seeded teams); each must buy `teamsPerPlayer`
 * PAID teams; $0 rows are free "bonus" teams that don't count toward that requirement.
 * Scoring: points = Σ (entity.seed × entity.wins). Ported from bromadness's auction
 * (seeded throwout order, done-skipping rotation). Server wiring lives in auction-server.
 */

export interface AuctionConfig {
  entryCents: number;        // real-money buy-in per player (0 = free)
  salaryCapCents: number;    // default 10000 ($100) of FAKE bidding money
  bidIncrementCents: number; // default 500 ($5)
  teamsPerPlayer: number;    // default 3
  orderSeed: string;         // deterministic throwout order
  firstParticipantId: string | null; // optional pinned first picker
  complete: boolean;
  tournamentId: string | null; // entity catalog = this tournament's field
  onBlockEntityId: string | null; // the lot currently up for bids (live recorder + board)
  scoringMode: ScoringMode;     // how a win scores (default: seed per win)
  // Payouts — admin-entered prize amounts (bromadness model). The system resolves who won
  // each: tournament places from the bracket, points places from the standings.
  payoutTournamentCents: number[]; // [1st champion, 2nd runner-up, 3rd Final Four losers]
  payoutPointsCents: number[];     // [1st, 2nd, 3rd]
}

/** How a team win scores: base (1 or its seed) × multiplier (none or the round number). */
export type ScoringMode = "flat" | "flat_round" | "seed" | "seed_round";
export const SCORING_MODES: { value: ScoringMode; label: string }[] = [
  { value: "flat", label: "1 point per win" },
  { value: "flat_round", label: "1 point per win × round" },
  { value: "seed", label: "Seed number per win" },
  { value: "seed_round", label: "Seed number per win × round" },
];

/** Points a single win is worth under the given mode. `round` is the bracket round (First
 *  Four = 0, so a play-in win is worth 0 in the round-weighted modes). */
export function pointsForWin(mode: ScoringMode, seed: number, round: number): number {
  const base = mode === "seed" || mode === "seed_round" ? seed : 1;
  const mult = mode === "flat_round" || mode === "seed_round" ? round : 1;
  return base * mult;
}

export interface AuctionOwnership {
  userId: string;
  entityId: string;
  bidCents: number; // 0 = bonus/free
}

// ----- Capacity + auto-pairing (free team bundles) -------------------------------------
//
// The field is 64 teams (after the First Four resolves). Each player buys K teams, where
// K = floor(64 / players) so the field divides as evenly as possible and K is never below
// 3 (so the max is floor(64/3) = 21 players). The B = 64 − K·players leftover teams are
// bundled onto other lots as free "throw-ins": a weak bottom seed rides along with a
// host in its own region, so no hopeless team is a standalone lot. The buyer bids on the
// host and the throw-in comes free (a $0 row), counting as one of their K.

/** Minimum teams per player — sets the participant cap at floor(teamCount / 3). */
export const MIN_TEAMS_PER_PLAYER = 3;

/** Throw-in seed + the host seed it rides with, weakest tier first. Both are in the same
 *  region; throw-in seeds (13–16) and host seeds (9–12) never overlap. */
export const BUNDLE_TIERS: { throwIn: number; host: number }[] = [
  { throwIn: 16, host: 12 }, { throwIn: 15, host: 11 }, { throwIn: 14, host: 10 }, { throwIn: 13, host: 9 },
];

export interface CapacityTeam { id: string; seed: number; region: string | null; record: string | null; isPlayIn: boolean }
export interface AuctionBundle { hostId: string; throwInId: string }

export interface AuctionCapacity {
  teamCount: number;
  participantCount: number;
  teamsPerPlayer: number;   // K = floor(teamCount / participants), >= MIN when within cap
  bundleCount: number;      // B = teamCount − K·participants
  lotCount: number;         // biddable lots = teamCount − B = K·participants
  maxParticipants: number;  // floor(teamCount / MIN_TEAMS_PER_PLAYER)
  overCapacity: boolean;    // participants beyond the max (can't give everyone MIN teams)
}

/** Derive the auction's capacity math from the team + participant counts. */
export function auctionCapacity(teamCount: number, participantCount: number): AuctionCapacity {
  const maxParticipants = Math.floor(teamCount / MIN_TEAMS_PER_PLAYER);
  const p = Math.max(0, participantCount);
  const k = p > 0 ? Math.floor(teamCount / p) : 0;
  const b = p > 0 ? teamCount - k * p : 0;
  return { teamCount, participantCount: p, teamsPerPlayer: k, bundleCount: b, lotCount: k * p, maxParticipants, overCapacity: p > maxParticipants };
}

/** Wins from a "19-17" record string (the weakness tiebreak); 0 when unknown. */
function winsOf(record: string | null): number {
  const n = parseInt((record ?? "").split("-")[0], 10);
  return Number.isFinite(n) ? n : 0;
}

/** Same-seed teams ordered weakest first: First Four teams (the committee's weakest at a
 *  seed line) lead, then fewest wins. */
function weakestFirst(teams: CapacityTeam[]): CapacityTeam[] {
  return [...teams].sort((a, b) => {
    if (a.isPlayIn !== b.isPlayIn) return a.isPlayIn ? -1 : 1;
    return winsOf(a.record) - winsOf(b.record);
  });
}

/**
 * Auto-pair the leftover teams into free-throw-in bundles for the given participant count.
 * Fills each tier (16+12, 15+11, …) across all four regions, weakest region first, until
 * B bundles exist. Returns host→throw-in pairs (the throw-in is the free rider). Expects a
 * clean 64-team field (one team per region per seed); returns [] when no bundles are needed.
 */
export function auctionBundles(teams: CapacityTeam[], participantCount: number): AuctionBundle[] {
  let remaining = auctionCapacity(teams.length, participantCount).bundleCount;
  if (remaining <= 0) return [];

  const byRegionSeed = new Map<string, CapacityTeam>();
  const bySeed = new Map<number, CapacityTeam[]>();
  for (const t of teams) {
    if (t.region) byRegionSeed.set(`${t.region}:${t.seed}`, t);
    (bySeed.get(t.seed) ?? bySeed.set(t.seed, []).get(t.seed)!).push(t);
  }

  const bundles: AuctionBundle[] = [];
  for (const tier of BUNDLE_TIERS) {
    if (remaining <= 0) break;
    for (const ti of weakestFirst(bySeed.get(tier.throwIn) ?? [])) {
      if (remaining <= 0) break;
      if (!ti.region) continue;
      const host = byRegionSeed.get(`${ti.region}:${tier.host}`);
      if (!host) continue;
      bundles.push({ hostId: host.id, throwInId: ti.id });
      remaining -= 1;
    }
  }
  return bundles;
}

/** Deterministic shuffle from a string seed (bromadness parity — same order every load). */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) { hash = (hash << 5) - hash + seed.charCodeAt(i); hash = hash & hash; }
  for (let i = result.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const j = hash % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The throwout order: a seeded shuffle, with an optional pinned first participant. */
export function draftOrder(participantIds: string[], seed: string, firstId: string | null): string[] {
  if (firstId && participantIds.includes(firstId)) {
    return [firstId, ...seededShuffle(participantIds.filter((p) => p !== firstId), seed)];
  }
  return seededShuffle(participantIds, seed);
}

/** Cents a participant has spent / has left against the cap. */
export function budget(ownership: AuctionOwnership[], userId: string, capCents: number): { spent: number; remaining: number } {
  const spent = ownership.filter((o) => o.userId === userId).reduce((s, o) => s + o.bidCents, 0);
  return { spent, remaining: capCents - spent };
}

/** Teams a participant has bought that COUNT (bid > 0; bonus $0 teams don't). */
export function paidTeamCount(ownership: AuctionOwnership[], userId: string): number {
  return ownership.filter((o) => o.userId === userId && o.bidCents > 0).length;
}

/** A participant is done once they hold `teamsPerPlayer` paid teams. */
export function isDone(ownership: AuctionOwnership[], userId: string, teamsPerPlayer: number): boolean {
  return paidTeamCount(ownership, userId) >= teamsPerPlayer;
}

/**
 * Whose turn it is to throw out a team + who's on deck (bromadness getNextTwoThrowers):
 * a round-robin keyed off total teams assigned so far, skipping anyone already done.
 */
export function nextThrowers(
  order: string[], ownership: AuctionOwnership[], teamsPerPlayer: number,
): { currentId: string | null; onDeckId: string | null } {
  const n = order.length;
  if (n === 0) return { currentId: null, onDeckId: null };
  // Rotation advances per LOT thrown (a paid bid); free $0 throw-ins/bonus don't count.
  const totalAssigned = ownership.filter((o) => o.bidCents > 0).length;
  const done = (id: string) => isDone(ownership, id, teamsPerPlayer);

  let base = totalAssigned % n;
  let attempts = 0;
  while (done(order[base]) && attempts < n) { base = (base + 1) % n; attempts++; }
  if (attempts >= n) return { currentId: null, onDeckId: null }; // everyone done
  const currentId = order[base];

  let deck = (base + 1) % n;
  let deckAttempts = 0;
  while (deck !== base && deckAttempts < n) {
    if (!done(order[deck])) return { currentId, onDeckId: order[deck] };
    deck = (deck + 1) % n;
    deckAttempts++;
  }
  return { currentId, onDeckId: null };
}

/** Points for a participant: Σ over their owned entities of Σ over that team's wins of
 *  pointsForWin(mode, seed, round). `winRoundsByEntity` is the list of rounds each team won. */
export function userPoints(
  ownership: AuctionOwnership[], userId: string,
  seedByEntity: Map<string, number>, winRoundsByEntity: Map<string, number[]>, mode: ScoringMode,
): number {
  return ownership
    .filter((o) => o.userId === userId)
    .reduce((pts, o) => {
      const seed = seedByEntity.get(o.entityId) ?? 0;
      return pts + (winRoundsByEntity.get(o.entityId) ?? []).reduce((s, round) => s + pointsForWin(mode, seed, round), 0);
    }, 0);
}

/** Read an auction config off a contest's config JSON, with bromadness defaults. */
export function auctionConfigOf(config: Record<string, unknown> | null | undefined): AuctionConfig {
  const c = config ?? {};
  return {
    entryCents: Number(c.entry_cents) || 0,
    salaryCapCents: Number(c.salary_cap_cents) || 10000,
    bidIncrementCents: Number(c.bid_increment_cents) || 500,
    teamsPerPlayer: Number(c.teams_per_player) || 3,
    orderSeed: typeof c.order_seed === "string" && c.order_seed ? c.order_seed : "",
    firstParticipantId: typeof c.first_participant_id === "string" ? c.first_participant_id : null,
    complete: c.auction_complete === true,
    tournamentId: typeof c.tournament_id === "string" ? c.tournament_id : null,
    onBlockEntityId: typeof c.on_block_entity_id === "string" ? c.on_block_entity_id : null,
    scoringMode: ["flat", "flat_round", "seed", "seed_round"].includes(c.scoring_mode as string) ? (c.scoring_mode as ScoringMode) : "seed",
    payoutTournamentCents: Array.isArray(c.payout_tournament_cents) ? (c.payout_tournament_cents as unknown[]).map((n) => Number(n) || 0) : [],
    payoutPointsCents: Array.isArray(c.payout_points_cents) ? (c.payout_points_cents as unknown[]).map((n) => Number(n) || 0) : [],
  };
}
