import type { SupabaseClient } from "@supabase/supabase-js";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { orgNameMode } from "@/lib/v2/orgs";
import { loadTournamentSource } from "./tournament-server";
import {
  auctionConfigOf, draftOrder, nextThrowers, budget, paidTeamCount, isDone, userPoints,
  auctionCapacity, auctionBundles, MIN_TEAMS_PER_PLAYER,
  type AuctionConfig, type AuctionOwnership, type AuctionBundle, type AuctionCapacity, type CapacityTeam,
} from "./auction";

/**
 * Server wiring for the Auction (#227): assemble the live board (field + ownership +
 * budgets + draft order + points), and record / undo an assignment. The entity catalog
 * is a shared tournament's field (config.tournament_id → v2_tournament_teams); wins +
 * champion/runner-up are read from the tournament, so one results entry feeds scoring.
 *
 * The field is 64 POSITIONS — the (region, seed) cells of the bracket. A normal cell holds
 * one team; a First Four cell holds two ("winner of A/B") until the play-in resolves, so
 * the auction can run before the play-in games are played (both teams transfer to the
 * buyer; only the one that advances scores). Teams-per-player and the free-throw-in bundles
 * are derived from the participant count (see auction.ts): a host position is biddable and
 * its bundled throw-in position rides along free. Bundles reflow with the headcount until
 * the first lot sells, then freeze.
 */

export interface AuctionEntity {
  id: string; name: string; short_name: string | null; seed: number; region: string | null;
  record: string | null; logo_url: string | null; eliminated: boolean; wins: number;
  playInSlot: boolean;              // an unresolved First Four cell ("winner of A/B")
  ownerId: string | null; bidCents: number | null;
  bundledThrowIn: AuctionEntity | null; // free rider position that comes with this host
}
export interface AuctionParticipant {
  userId: string; name: string;
  spentCents: number; remainingCents: number; paidTeams: number; done: boolean; points: number;
  teams: { entityId: string; name: string; seed: number; bidCents: number; freeName: string | null }[];
}
export interface AuctionResults {
  championTeamId: string | null; championName: string | null; championOwnerId: string | null;
  runnerUpTeamId: string | null; runnerUpName: string | null; runnerUpOwnerId: string | null;
}
export interface AuctionState {
  contest: { id: string; orgId: string; name: string; status: string };
  config: AuctionConfig;
  tournament: { id: string; name: string } | null;
  capacity: AuctionCapacity;
  fieldReady: boolean;      // a full 64-position bracket is loaded
  bundlesFrozen: boolean;   // locked in (a lot has sold or an override is set)
  entities: AuctionEntity[];        // biddable lots (singles + hosts), seed order
  participants: AuctionParticipant[]; // in draft order
  currentId: string | null;
  onDeckId: string | null;
  onBlock: AuctionEntity | null;    // the lot currently up for bids
  results: AuctionResults;
}

async function names(admin: SupabaseClient, orgId: string, ids: string[]): Promise<{ map: Map<string, string>; mode: NameMode }> {
  const mode = await orgNameMode(admin, orgId);
  if (!ids.length) return { map: new Map(), mode };
  const { data } = await admin.from("v2_profiles").select("id, display_name, first_name, last_name, nickname").in("id", ids);
  return { map: new Map((data || []).map((p) => [p.id as string, pickName(p, mode, "Member")])), mode };
}

/** Read the frozen/overridden bundle list off a raw contest config, if present. */
function storedBundlesOf(raw: Record<string, unknown> | null | undefined): AuctionBundle[] | null {
  const b = raw?.bundles;
  if (!Array.isArray(b)) return null;
  return b.filter((x): x is AuctionBundle => !!x && typeof x === "object" && typeof (x as AuctionBundle).hostId === "string" && typeof (x as AuctionBundle).throwInId === "string");
}

interface FieldTeam {
  id: string; name: string; short_name: string | null; seed: number; region: string | null;
  record: string | null; logo_url: string | null; eliminated: boolean; play_in_slot: string | null;
}

/** A bracket cell: one biddable lot of 1–2 teams. Two teams = an unresolved First Four. */
interface Position {
  id: string;            // stable representative team id (min member id) — carries the bid
  seed: number; region: string | null;
  teamIds: string[];     // all member team ids (1 or 2)
  name: string;          // "Duke" or "American / Mount St. Mary's" (→ winner once resolved)
  record: string | null; logo_url: string | null;
  eliminated: boolean;   // the cell's run is over (all members out)
  playInSlot: boolean;   // two teams, not yet resolved
}

const minId = (a: string, b: string) => (a < b ? a : b);

/**
 * The auctionable field (64 positions) + derived lot structure for a contest. Positions
 * come from grouping the tournament's teams by (region, seed), so a First Four cell is one
 * lot regardless of whether it's been played. "Ready" means a full 4×16 bracket is loaded.
 * Bundles are the stored override when present, else computed live from the headcount.
 */
async function resolveField(
  admin: SupabaseClient, config: AuctionConfig, participantCount: number, storedBundles: AuctionBundle[] | null,
): Promise<{
  positions: Position[]; capacity: AuctionCapacity; fieldReady: boolean;
  bundles: AuctionBundle[]; frozen: boolean; throwInIds: Set<string>; throwInByHost: Map<string, string>;
  posById: Map<string, Position>; teamIdsByLot: Map<string, string[]>;
}> {
  const empty = {
    positions: [] as Position[], capacity: auctionCapacity(0, participantCount), fieldReady: false,
    bundles: [] as AuctionBundle[], frozen: false, throwInIds: new Set<string>(), throwInByHost: new Map<string, string>(),
    posById: new Map<string, Position>(), teamIdsByLot: new Map<string, string[]>(),
  };
  if (!config.tournamentId) return empty;
  const src = await loadTournamentSource(admin, config.tournamentId);
  if (!src) return empty;

  // Group every team into its (region, seed) cell.
  const cells = new Map<string, FieldTeam[]>();
  for (const t of src.teams) {
    if (!t.region) continue;
    const key = `${t.region}:${t.seed}`;
    const ft: FieldTeam = { id: t.id, name: t.name, short_name: t.short_name, seed: t.seed, region: t.region, record: t.record, logo_url: t.logo_url, eliminated: t.eliminated, play_in_slot: t.play_in_slot };
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(ft);
  }

  const positions: Position[] = [];
  for (const members of cells.values()) {
    const live = members.filter((m) => !m.eliminated);
    const isPlayIn = members.length > 1;
    const resolved = isPlayIn && live.length === 1;
    const face = resolved ? live[0] : members[0]; // the team whose logo/record represents the cell
    const name = isPlayIn && !resolved ? `Winner of ${members.map((m) => m.short_name || m.name).join(" / ")}` : face.name;
    positions.push({
      id: members.reduce((m, t) => minId(m, t.id), members[0].id),
      seed: members[0].seed, region: members[0].region,
      teamIds: members.map((m) => m.id), name,
      record: face.record, logo_url: isPlayIn && !resolved ? null : face.logo_url,
      eliminated: members.every((m) => m.eliminated), playInSlot: isPlayIn && !resolved,
    });
  }

  const regions = new Set(positions.map((p) => p.region).filter(Boolean));
  const fieldReady = positions.length === 64 && regions.size === 4;
  const capacity = auctionCapacity(positions.length, participantCount);

  let bundles: AuctionBundle[] = [];
  if (storedBundles) bundles = storedBundles;
  else if (fieldReady) {
    const capTeams: CapacityTeam[] = positions.map((p) => ({ id: p.id, seed: p.seed, region: p.region, record: p.record, isPlayIn: p.playInSlot }));
    bundles = auctionBundles(capTeams, participantCount);
  }
  const posById = new Map(positions.map((p) => [p.id, p]));
  bundles = bundles.filter((b) => posById.has(b.hostId) && posById.has(b.throwInId));

  const throwInIds = new Set(bundles.map((b) => b.throwInId));
  const throwInByHost = new Map(bundles.map((b) => [b.hostId, b.throwInId]));
  // Team ids each biddable lot assigns: its own cell's teams + its throw-in cell's teams.
  const teamIdsByLot = new Map<string, string[]>();
  for (const p of positions) {
    if (throwInIds.has(p.id)) continue;
    const ids = [...p.teamIds];
    const ti = throwInByHost.get(p.id);
    if (ti) ids.push(...(posById.get(ti)?.teamIds ?? []));
    teamIdsByLot.set(p.id, ids);
  }

  return { positions, capacity, fieldReady, bundles, frozen: !!storedBundles, throwInIds, throwInByHost, posById, teamIdsByLot };
}

export async function loadAuction(admin: SupabaseClient, contestId: string): Promise<AuctionState | null> {
  const { data: contest } = await admin.from("v2_contests").select("id, org_id, name, status, config, contest_type").eq("id", contestId).maybeSingle();
  if (!contest || contest.contest_type !== "auction") return null;
  const config = auctionConfigOf(contest.config as Record<string, unknown> | null);

  const [{ data: parts }, { data: ownRows }] = await Promise.all([
    admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId),
    admin.from("v2_auction_teams").select("user_id, entity_id, bid_cents").eq("contest_id", contestId),
  ]);
  const participantIds = (parts || []).map((p) => p.user_id as string);
  const ownership: AuctionOwnership[] = (ownRows || []).map((o) => ({ userId: o.user_id as string, entityId: o.entity_id as string, bidCents: (o.bid_cents as number) || 0 }));

  const src = config.tournamentId ? await loadTournamentSource(admin, config.tournamentId) : null;
  const field = await resolveField(admin, config, participantIds.length, storedBundlesOf(contest.config as Record<string, unknown> | null));
  const teamsPerPlayer = field.capacity.teamsPerPlayer || config.teamsPerPlayer;

  // Points: seed × wins summed over every owned team row (both teams of a play-in slot;
  // only the one that advances has wins).
  const seedByEntity = new Map((src?.teams || []).map((t) => [t.id, t.seed]));
  const winsByEntity = new Map((src?.teams || []).map((t) => [t.id, src!.teamWins(t.id)]));
  const ownerByTeam = new Map(ownership.map((o) => [o.entityId, o]));

  const posWins = (p: Position) => p.teamIds.reduce((w, id) => w + (winsByEntity.get(id) ?? 0), 0);
  const toEntity = (p: Position, rider: AuctionEntity | null): AuctionEntity => {
    const o = ownerByTeam.get(p.id) || null;
    return {
      id: p.id, name: p.name, short_name: null, seed: p.seed, region: p.region, record: p.record, logo_url: p.logo_url,
      eliminated: p.eliminated, wins: posWins(p), playInSlot: p.playInSlot, ownerId: o?.userId ?? null, bidCents: o?.bidCents ?? null, bundledThrowIn: rider,
    };
  };

  // Biddable lots = positions that aren't a free throw-in; each host carries its rider.
  const entities: AuctionEntity[] = field.positions
    .filter((p) => !field.throwInIds.has(p.id))
    .map((p) => {
      const tiId = field.throwInByHost.get(p.id);
      const ti = tiId ? field.posById.get(tiId) : undefined;
      return toEntity(p, ti ? toEntity(ti, null) : null);
    })
    .sort((a, b) => a.seed - b.seed);

  const { map: nameMap } = await names(admin, contest.org_id as string, participantIds);
  const order = draftOrder(participantIds, config.orderSeed, config.firstParticipantId);
  const { currentId, onDeckId } = nextThrowers(order, ownership, teamsPerPlayer);

  // Each participant's lots = the biddable positions whose representative they own.
  const lotsByOwner = new Map<string, AuctionEntity[]>();
  for (const e of entities) if (e.ownerId) (lotsByOwner.get(e.ownerId) ?? lotsByOwner.set(e.ownerId, []).get(e.ownerId)!).push(e);

  const participants: AuctionParticipant[] = order.map((uid) => {
    const b = budget(ownership, uid, config.salaryCapCents);
    const lots = (lotsByOwner.get(uid) ?? []).map((e) => ({
      entityId: e.id, name: e.name, seed: e.seed, bidCents: e.bidCents ?? 0, freeName: e.bundledThrowIn?.name ?? null,
    })).sort((a, b2) => b2.bidCents - a.bidCents);
    return {
      userId: uid, name: nameMap.get(uid) || "Member",
      spentCents: b.spent, remainingCents: b.remaining, paidTeams: paidTeamCount(ownership, uid), done: isDone(ownership, uid, teamsPerPlayer),
      points: userPoints(ownership, uid, seedByEntity, winsByEntity), teams: lots,
    };
  });

  const champTeamId = src?.champion() ?? null;
  const runnerTeamId = src?.runnerUp() ?? null;
  const results: AuctionResults = {
    championTeamId: champTeamId, championName: champTeamId ? src?.teamById.get(champTeamId)?.name ?? null : null,
    championOwnerId: champTeamId ? ownerByTeam.get(champTeamId)?.userId ?? null : null,
    runnerUpTeamId: runnerTeamId, runnerUpName: runnerTeamId ? src?.teamById.get(runnerTeamId)?.name ?? null : null,
    runnerUpOwnerId: runnerTeamId ? ownerByTeam.get(runnerTeamId)?.userId ?? null : null,
  };
  const onBlock = config.onBlockEntityId ? entities.find((e) => e.id === config.onBlockEntityId) ?? null : null;

  return {
    contest: { id: contest.id as string, orgId: contest.org_id as string, name: contest.name as string, status: contest.status as string },
    config: { ...config, teamsPerPlayer },
    tournament: src ? { id: src.tournament.id, name: src.tournament.name } : null,
    capacity: field.capacity, fieldReady: field.fieldReady, bundlesFrozen: field.frozen || ownership.length > 0,
    entities, participants, currentId, onDeckId, onBlock, results,
  };
}

export interface AuctionPrize { key: string; label: string; amountCents: number; winnerId: string | null; winnerName: string | null }
export interface AuctionWinner { userId: string; name: string; wonCents: number; prizeLabels: string[]; paidCents: number }
export interface AuctionPayouts { ready: boolean; totalCents: number; prizes: AuctionPrize[]; winners: AuctionWinner[] }

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? "th"}`;

/**
 * Auction payouts: resolve each admin-set prize to its winner (champion/runner-up owner
 * from the bracket; points places from the standings), then aggregate per winner with
 * their settled total (source='winnings' ledger credits). Ready once the champion is
 * decided. Mirrors loadPickemPayouts' settlement shape.
 */
export async function loadAuctionPayouts(admin: SupabaseClient, contestId: string): Promise<AuctionPayouts | null> {
  const state = await loadAuction(admin, contestId);
  if (!state) return null;
  const cfg = state.config;
  const nameOf = (uid: string | null) => (uid ? state.participants.find((p) => p.userId === uid)?.name ?? "Member" : null);

  const prizes: AuctionPrize[] = [];
  if (cfg.payoutChampionCents > 0) prizes.push({ key: "champion", label: "Champion owner", amountCents: cfg.payoutChampionCents, winnerId: state.results.championOwnerId, winnerName: nameOf(state.results.championOwnerId) });
  if (cfg.payoutRunnerUpCents > 0) prizes.push({ key: "runner_up", label: "Runner-up owner", amountCents: cfg.payoutRunnerUpCents, winnerId: state.results.runnerUpOwnerId, winnerName: nameOf(state.results.runnerUpOwnerId) });
  const standings = [...state.participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents);
  cfg.payoutPointsCents.forEach((amt, i) => {
    if (amt > 0) { const w = standings[i] ?? null; prizes.push({ key: `points_${i + 1}`, label: `Points, ${ordinal(i + 1)}`, amountCents: amt, winnerId: w?.userId ?? null, winnerName: w?.name ?? null }); }
  });

  const totalCents = prizes.reduce((s, p) => s + p.amountCents, 0);
  const ready = !!state.results.championTeamId;

  // Aggregate per winner.
  const byWinner = new Map<string, { won: number; labels: string[] }>();
  for (const p of prizes) {
    if (!p.winnerId) continue;
    const cur = byWinner.get(p.winnerId) ?? { won: 0, labels: [] };
    cur.won += p.amountCents; cur.labels.push(p.label);
    byWinner.set(p.winnerId, cur);
  }
  const { data: credits } = byWinner.size
    ? await admin.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "winnings")
    : { data: [] as { user_id: string; amount_cents: number }[] };
  const paidByUser = new Map<string, number>();
  for (const c of credits ?? []) paidByUser.set(c.user_id as string, (paidByUser.get(c.user_id as string) || 0) + ((c.amount_cents as number) || 0));

  const winners: AuctionWinner[] = [...byWinner.entries()]
    .map(([userId, v]) => ({ userId, name: nameOf(userId) || "Member", wonCents: v.won, prizeLabels: v.labels, paidCents: paidByUser.get(userId) || 0 }))
    .sort((a, b) => b.wonCents - a.wonCents);

  return { ready, totalCents, prizes, winners };
}

/** The participant cap for an auction: floor(position count / 3). 0 when no field. */
export async function auctionMaxParticipants(admin: SupabaseClient, contestId: string): Promise<number> {
  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  if (!contest) return 0;
  const config = auctionConfigOf(contest.config as Record<string, unknown> | null);
  if (!config.tournamentId) return 0;
  const src = await loadTournamentSource(admin, config.tournamentId);
  if (!src) return 0;
  const cells = new Set(src.teams.filter((t) => t.region).map((t) => `${t.region}:${t.seed}`));
  return Math.floor(cells.size / MIN_TEAMS_PER_PLAYER);
}

/** Freeze the current live bundles into config the first time a lot is recorded, so the
 *  pairings stop reflowing once bidding has begun. No-op if already stored. */
async function freezeBundlesIfNeeded(admin: SupabaseClient, contestId: string): Promise<void> {
  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  const raw = (contest?.config as Record<string, unknown> | null) ?? {};
  if (Array.isArray(raw.bundles)) return; // already frozen / overridden
  const config = auctionConfigOf(raw);
  const { count } = await admin.from("v2_contest_participants").select("user_id", { count: "exact", head: true }).eq("contest_id", contestId);
  const field = await resolveField(admin, config, count ?? 0, null); // not frozen yet (guarded above)
  if (!field.fieldReady) return;
  await admin.from("v2_contests").update({ config: { ...raw, bundles: field.bundles }, updated_at: new Date().toISOString() }).eq("id", contestId);
}

/** Assign (or reassign) a lot to a participant at a bid. The lot's representative carries
 *  the price; its other teams (a play-in slot's second team, a bundled throw-in's teams)
 *  come free ($0 rows). Enforces the cap for the paid bid. */
export async function assignTeam(
  admin: SupabaseClient, contestId: string,
  input: { entityId: string; userId: string; bidCents: number; assignedBy: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  await freezeBundlesIfNeeded(admin, contestId);

  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  if (!contest) return { ok: false, status: 404, error: "Contest not found" };
  const config = auctionConfigOf(contest.config as Record<string, unknown> | null);

  const { count: pCount } = await admin.from("v2_contest_participants").select("user_id", { count: "exact", head: true }).eq("contest_id", contestId);
  const field = await resolveField(admin, config, pCount ?? 0, storedBundlesOf(contest.config as Record<string, unknown> | null));
  if (field.throwInIds.has(input.entityId)) return { ok: false, status: 400, error: "That's a free throw-in; bid on its host instead." };
  const teamIds = field.teamIdsByLot.get(input.entityId);
  if (!teamIds) return { ok: false, status: 400, error: "Unknown lot" };

  const bid = Math.max(0, Math.round(input.bidCents));
  const [{ data: parts }, { data: own }] = await Promise.all([
    admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId).eq("user_id", input.userId).maybeSingle(),
    admin.from("v2_auction_teams").select("entity_id, bid_cents").eq("contest_id", contestId).eq("user_id", input.userId),
  ]);
  if (!parts) return { ok: false, status: 400, error: "That member isn't in this auction" };

  // Cap check: their other spend (exclude this lot's teams if a reassignment) + this bid.
  const lotSet = new Set(teamIds);
  const otherSpend = (own || []).filter((o) => !lotSet.has(o.entity_id as string)).reduce((s, o) => s + ((o.bid_cents as number) || 0), 0);
  if (bid > 0 && otherSpend + bid > config.salaryCapCents) return { ok: false, status: 400, error: "Over the salary cap" };

  // One priced row (the representative), the rest free.
  const rows = teamIds.map((tid) => ({ contest_id: contestId, user_id: input.userId, entity_id: tid, bid_cents: tid === input.entityId ? bid : 0, assigned_by: input.assignedBy }));
  const { error } = await admin.from("v2_auction_teams").upsert(rows, { onConflict: "contest_id,entity_id" });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

/** Undo an assignment (the whole lot goes back on the block). */
export async function unassignTeam(admin: SupabaseClient, contestId: string, entityId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  const config = auctionConfigOf(contest?.config as Record<string, unknown> | null);
  const { count: pCount } = await admin.from("v2_contest_participants").select("user_id", { count: "exact", head: true }).eq("contest_id", contestId);
  const field = await resolveField(admin, config, pCount ?? 0, storedBundlesOf(contest?.config as Record<string, unknown> | null));

  const ids = field.teamIdsByLot.get(entityId) ?? [entityId];
  const { error } = await admin.from("v2_auction_teams").delete().eq("contest_id", contestId).in("entity_id", ids);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
