/**
 * Auction contest (#227) — pure logic. Participants bid a salary cap of fake money to
 * own entities (a shared tournament's seeded teams); each must buy `teamsPerPlayer`
 * PAID teams; $0 rows are free "bonus" teams that don't count toward that requirement.
 * Scoring: points = Σ (entity.seed × entity.wins). Ported from bromadness's auction
 * (seeded throwout order, done-skipping rotation). Server wiring lives in auction-server.
 */

export interface AuctionConfig {
  salaryCapCents: number;    // default 10000 ($100)
  bidIncrementCents: number; // default 500 ($5)
  teamsPerPlayer: number;    // default 3
  orderSeed: string;         // deterministic throwout order
  firstParticipantId: string | null; // optional pinned first picker
  complete: boolean;
  tournamentId: string | null; // entity catalog = this tournament's field
}

export interface AuctionOwnership {
  userId: string;
  entityId: string;
  bidCents: number; // 0 = bonus/free
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
  const totalAssigned = ownership.length;
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

/** Seed-based points for a participant: Σ (seed × wins) over their owned entities. */
export function userPoints(
  ownership: AuctionOwnership[], userId: string,
  seedByEntity: Map<string, number>, winsByEntity: Map<string, number>,
): number {
  return ownership
    .filter((o) => o.userId === userId)
    .reduce((pts, o) => pts + (seedByEntity.get(o.entityId) ?? 0) * (winsByEntity.get(o.entityId) ?? 0), 0);
}

/** Read an auction config off a contest's config JSON, with bromadness defaults. */
export function auctionConfigOf(config: Record<string, unknown> | null | undefined): AuctionConfig {
  const c = config ?? {};
  return {
    salaryCapCents: Number(c.salary_cap_cents) || 10000,
    bidIncrementCents: Number(c.bid_increment_cents) || 500,
    teamsPerPlayer: Number(c.teams_per_player) || 3,
    orderSeed: typeof c.order_seed === "string" && c.order_seed ? c.order_seed : "",
    firstParticipantId: typeof c.first_participant_id === "string" ? c.first_participant_id : null,
    complete: c.auction_complete === true,
    tournamentId: typeof c.tournament_id === "string" ? c.tournament_id : null,
  };
}
