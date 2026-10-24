import type { SupabaseClient } from "@supabase/supabase-js";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { orgNameMode } from "@/lib/v2/orgs";
import { loadTournamentSource } from "./tournament-server";
import {
  auctionConfigOf, draftOrder, nextThrowers, budget, paidTeamCount, isDone, userPoints,
  type AuctionConfig, type AuctionOwnership,
} from "./auction";

/**
 * Server wiring for the Auction (#227): assemble the live board (field + ownership +
 * budgets + draft order + points), and record / undo an assignment. The entity catalog
 * is a shared tournament's field (config.tournament_id → v2_tournament_teams); wins +
 * champion/runner-up are read from the tournament, so one results entry feeds scoring.
 */

export interface AuctionEntity { id: string; name: string; short_name: string | null; seed: number; region: string | null; eliminated: boolean; wins: number; ownerId: string | null; bidCents: number | null }
export interface AuctionParticipant {
  userId: string; name: string;
  spentCents: number; remainingCents: number; paidTeams: number; done: boolean; points: number;
  teams: { entityId: string; name: string; seed: number; bidCents: number; bonus: boolean }[];
}
export interface AuctionState {
  contest: { id: string; orgId: string; name: string; status: string };
  config: AuctionConfig;
  tournament: { id: string; name: string } | null;
  entities: AuctionEntity[];        // the field (seed order), with owner
  participants: AuctionParticipant[]; // in draft order
  currentId: string | null;
  onDeckId: string | null;
}

async function names(admin: SupabaseClient, orgId: string, ids: string[]): Promise<{ map: Map<string, string>; mode: NameMode }> {
  const mode = await orgNameMode(admin, orgId);
  if (!ids.length) return { map: new Map(), mode };
  const { data } = await admin.from("v2_profiles").select("id, display_name, first_name, last_name, nickname").in("id", ids);
  return { map: new Map((data || []).map((p) => [p.id as string, pickName(p, mode, "Member")])), mode };
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
  const seedByEntity = new Map((src?.teams || []).map((t) => [t.id, t.seed]));
  const winsByEntity = new Map((src?.teams || []).map((t) => [t.id, src!.teamWins(t.id)]));
  const ownerByEntity = new Map(ownership.map((o) => [o.entityId, o]));

  const entities: AuctionEntity[] = (src?.teams || []).map((t) => {
    const o = ownerByEntity.get(t.id) || null;
    return { id: t.id, name: t.name, short_name: t.short_name, seed: t.seed, region: t.region, eliminated: t.eliminated, wins: winsByEntity.get(t.id) ?? 0, ownerId: o?.userId ?? null, bidCents: o?.bidCents ?? null };
  }).sort((a, b) => a.seed - b.seed);

  const { map: nameMap } = await names(admin, contest.org_id as string, participantIds);
  const order = draftOrder(participantIds, config.orderSeed, config.firstParticipantId);
  const { currentId, onDeckId } = nextThrowers(order, ownership, config.teamsPerPlayer);

  const participants: AuctionParticipant[] = order.map((uid) => {
    const b = budget(ownership, uid, config.salaryCapCents);
    const teams = ownership.filter((o) => o.userId === uid).map((o) => {
      const t = src?.teamById.get(o.entityId);
      return { entityId: o.entityId, name: t?.name ?? "?", seed: t?.seed ?? 0, bidCents: o.bidCents, bonus: o.bidCents === 0 };
    }).sort((a, b2) => b2.bidCents - a.bidCents);
    return {
      userId: uid, name: nameMap.get(uid) || "Member",
      spentCents: b.spent, remainingCents: b.remaining, paidTeams: paidTeamCount(ownership, uid), done: isDone(ownership, uid, config.teamsPerPlayer),
      points: userPoints(ownership, uid, seedByEntity, winsByEntity), teams,
    };
  });

  return {
    contest: { id: contest.id as string, orgId: contest.org_id as string, name: contest.name as string, status: contest.status as string },
    config,
    tournament: src ? { id: src.tournament.id, name: src.tournament.name } : null,
    entities, participants, currentId, onDeckId,
  };
}

/** Assign (or reassign) an entity to a participant at a bid. Enforces the cap for paid
 *  bids ($0 = a free bonus team). Reassign is an upsert on (contest, entity). */
export async function assignTeam(
  admin: SupabaseClient, contestId: string,
  input: { entityId: string; userId: string; bidCents: number; assignedBy: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  if (!contest) return { ok: false, status: 404, error: "Contest not found" };
  const config = auctionConfigOf(contest.config as Record<string, unknown> | null);

  const bid = Math.max(0, Math.round(input.bidCents));
  const [{ data: parts }, { data: own }] = await Promise.all([
    admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId).eq("user_id", input.userId).maybeSingle(),
    admin.from("v2_auction_teams").select("entity_id, bid_cents").eq("contest_id", contestId).eq("user_id", input.userId),
  ]);
  if (!parts) return { ok: false, status: 400, error: "That member isn't in this auction" };

  // Cap check: their other spend (exclude this entity if a reassignment to them) + this bid.
  const otherSpend = (own || []).filter((o) => o.entity_id !== input.entityId).reduce((s, o) => s + ((o.bid_cents as number) || 0), 0);
  if (bid > 0 && otherSpend + bid > config.salaryCapCents) {
    return { ok: false, status: 400, error: "Over the salary cap" };
  }

  const { error } = await admin.from("v2_auction_teams").upsert(
    { contest_id: contestId, user_id: input.userId, entity_id: input.entityId, bid_cents: bid, assigned_by: input.assignedBy },
    { onConflict: "contest_id,entity_id" },
  );
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

/** Undo an assignment (the entity goes back on the block). */
export async function unassignTeam(admin: SupabaseClient, contestId: string, entityId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { error } = await admin.from("v2_auction_teams").delete().eq("contest_id", contestId).eq("entity_id", entityId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
