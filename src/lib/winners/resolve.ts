/**
 * Winner resolution orchestrator.
 * Resolves winners for a calcutta prize, inserts contest_winners rows,
 * locks the linked contest, and sends owner notifications.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { resolveScrambleWinner } from "./scramble";
import { resolveBspitwWinner, BspitwResult } from "./bspitw";
import { resolveCornholeWinner } from "./cornhole";
import { sendNotification } from "@/lib/notifications/service";

export interface ResolutionResult {
  resolved: boolean;
  winnerUserIds?: string[];
  tied?: boolean;
  tiedUserIds?: string[];
  tiedPoints?: number;
  tiebreakerLoss?: string;
  error?: string;
}

/**
 * Resolve winners for a single calcutta prize.
 * Idempotent: returns early if winners already exist.
 */
export async function resolveWinnersForPrize(
  supabase: SupabaseClient,
  prizeId: string,
  adminId?: string,
  inheritedNote?: string | null
): Promise<ResolutionResult> {
  // Fetch the prize config
  const { data: prize, error: prizeErr } = await supabase
    .from("calcutta_prizes")
    .select("id, contest_id, linked_contest_id, resolution_type, place, percentage, per_player, player_count, prize_name")
    .eq("id", prizeId)
    .single();

  if (prizeErr || !prize) {
    return { resolved: false, error: prizeErr?.message || "Prize not found" };
  }

  // Check if winners already exist (idempotent)
  const { data: existing } = await supabase
    .from("contest_winners")
    .select("id")
    .eq("prize_id", prizeId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { resolved: true };
  }

  // Determine resolution type
  let resolutionType = prize.resolution_type;
  if (!resolutionType && prize.linked_contest_id) {
    // Derive from linked contest type
    const { data: linkedContest } = await supabase
      .from("contests")
      .select("contest_type")
      .eq("id", prize.linked_contest_id)
      .single();
    resolutionType = linkedContest?.contest_type || null;
  }

  if (!resolutionType) {
    return { resolved: false, error: "No resolution_type and cannot derive from linked contest" };
  }

  // Dispatch to the appropriate resolver
  let winnerUserIds: string[] | null = null;
  let bspitwResult: BspitwResult | null = null;

  let tiebreakerNote: string | null = null;
  let tiebreakerLoss: string | null = null;

  switch (resolutionType) {
    case "scramble": {
      if (!prize.linked_contest_id) {
        return { resolved: false, error: "Scramble prize requires linked_contest_id" };
      }
      const result = await resolveScrambleWinner(supabase, prize.linked_contest_id, prize.place);
      if (result) {
        winnerUserIds = result.userIds;
        tiebreakerNote = result.tiebreaker || inheritedNote || null;
        tiebreakerLoss = result.tiebreakerLoss || null;
      }
      break;
    }

    case "bspitw": {
      // Need trip_id from the calcutta contest
      const { data: calcuttaContest } = await supabase
        .from("contests")
        .select("trip_id")
        .eq("id", prize.contest_id)
        .single();

      if (!calcuttaContest) {
        return { resolved: false, error: "Calcutta contest not found" };
      }

      bspitwResult = await resolveBspitwWinner(supabase, calcuttaContest.trip_id);
      if (bspitwResult.resolved && bspitwResult.userIds) {
        winnerUserIds = bspitwResult.userIds;
      } else if (bspitwResult.tied) {
        return {
          resolved: false,
          tied: true,
          tiedUserIds: bspitwResult.tiedUserIds,
          tiedPoints: bspitwResult.tiedPoints,
        };
      }
      break;
    }

    case "cornhole_singles": {
      if (!prize.linked_contest_id) {
        return { resolved: false, error: "Cornhole prize requires linked_contest_id" };
      }
      winnerUserIds = await resolveCornholeWinner(supabase, prize.linked_contest_id, "cornhole_singles", prize.place);
      break;
    }

    case "cornhole_doubles": {
      if (!prize.linked_contest_id) {
        return { resolved: false, error: "Cornhole prize requires linked_contest_id" };
      }
      winnerUserIds = await resolveCornholeWinner(supabase, prize.linked_contest_id, "cornhole_doubles", prize.place);
      break;
    }

    default:
      return { resolved: false, error: `Unknown resolution_type: ${resolutionType}` };
  }

  if (!winnerUserIds || winnerUserIds.length === 0) {
    return { resolved: false };
  }

  // Insert contest_winners rows
  const rows = winnerUserIds.map((userId) => ({
    prize_id: prizeId,
    user_id: userId,
    place: prize.place,
    notes: tiebreakerNote,
    resolved_by: adminId || null,
  }));

  const { error: insertErr } = await supabase
    .from("contest_winners")
    .insert(rows);

  if (insertErr) {
    return { resolved: false, error: insertErr.message };
  }

  // Lock the linked contest
  if (prize.linked_contest_id) {
    await supabase
      .from("contests")
      .update({
        winners_locked_at: new Date().toISOString(),
        winners_locked_by: adminId || null,
      })
      .eq("id", prize.linked_contest_id);
  }

  // Send owner notifications (fire and forget)
  notifyOwners(supabase, prize, winnerUserIds).catch(console.error);

  return { resolved: true, winnerUserIds, tiebreakerLoss: tiebreakerLoss || undefined };
}

/**
 * Manually set winners for a prize (admin override / BSPITW playoff).
 */
export async function manuallyResolveWinners(
  supabase: SupabaseClient,
  prizeId: string,
  winnerUserIds: string[],
  adminId: string,
  notes?: string
): Promise<ResolutionResult> {
  // Fetch the prize
  const { data: prize, error: prizeErr } = await supabase
    .from("calcutta_prizes")
    .select("id, contest_id, linked_contest_id, place, percentage, per_player, player_count, prize_name")
    .eq("id", prizeId)
    .single();

  if (prizeErr || !prize) {
    return { resolved: false, error: prizeErr?.message || "Prize not found" };
  }

  // Clear any existing winners for this prize
  await supabase
    .from("contest_winners")
    .delete()
    .eq("prize_id", prizeId);

  // Insert new winners
  const rows = winnerUserIds.map((userId) => ({
    prize_id: prizeId,
    user_id: userId,
    place: prize.place,
    is_playoff: true,
    notes: notes || null,
    resolved_by: adminId,
  }));

  const { error: insertErr } = await supabase
    .from("contest_winners")
    .insert(rows);

  if (insertErr) {
    return { resolved: false, error: insertErr.message };
  }

  // Lock the linked contest
  if (prize.linked_contest_id) {
    await supabase
      .from("contests")
      .update({
        winners_locked_at: new Date().toISOString(),
        winners_locked_by: adminId,
      })
      .eq("id", prize.linked_contest_id);
  }

  // Notify owners
  notifyOwners(supabase, prize, winnerUserIds).catch(console.error);

  return { resolved: true, winnerUserIds };
}

/**
 * Clear winners for a prize and unlock the linked contest.
 */
export async function clearWinnersForPrize(
  supabase: SupabaseClient,
  prizeId: string
): Promise<void> {
  const { data: prize } = await supabase
    .from("calcutta_prizes")
    .select("linked_contest_id")
    .eq("id", prizeId)
    .single();

  await supabase
    .from("contest_winners")
    .delete()
    .eq("prize_id", prizeId);

  if (prize?.linked_contest_id) {
    // Only unlock if no other prizes still reference this contest with winners
    const { data: otherWinners } = await supabase
      .from("contest_winners")
      .select("id, prize:calcutta_prizes!inner(linked_contest_id)")
      .neq("prize_id", prizeId);

    const stillLocked = otherWinners?.some((w) => {
      const p = Array.isArray(w.prize) ? w.prize[0] : w.prize;
      return p?.linked_contest_id === prize.linked_contest_id;
    });

    if (!stillLocked) {
      await supabase
        .from("contests")
        .update({ winners_locked_at: null, winners_locked_by: null })
        .eq("id", prize.linked_contest_id);
    }
  }
}

/**
 * Resolve all prizes linked to a specific contest.
 * Called when a scramble contest is verified.
 */
export async function resolveAllForContest(
  supabase: SupabaseClient,
  contestId: string,
  adminId?: string
): Promise<ResolutionResult[]> {
  // Find all calcutta prizes linked to this contest
  const { data: prizes } = await supabase
    .from("calcutta_prizes")
    .select("id, place")
    .eq("linked_contest_id", contestId)
    .order("place", { ascending: true });

  if (!prizes || prizes.length === 0) return [];

  const results: ResolutionResult[] = [];
  let pendingLossNote: string | null = null;
  for (const prize of prizes) {
    const result = await resolveWinnersForPrize(supabase, prize.id, adminId, pendingLossNote);
    results.push(result);
    // Pass the loser's tiebreaker note to the next place
    pendingLossNote = result.tiebreakerLoss || null;
  }

  return results;
}

/**
 * Attempt to resolve BSPITW prizes for a trip.
 * Called after the last scramble contest is verified.
 */
export async function attemptBspitwResolution(
  supabase: SupabaseClient,
  tripId: string,
  adminId?: string
): Promise<ResolutionResult | null> {
  // Find the calcutta contest for this trip
  const { data: calcuttaContest } = await supabase
    .from("contests")
    .select("id")
    .eq("trip_id", tripId)
    .eq("contest_type", "calcutta")
    .single();

  if (!calcuttaContest) return null;

  // Find BSPITW prizes
  const { data: bspitwPrizes } = await supabase
    .from("calcutta_prizes")
    .select("id")
    .eq("contest_id", calcuttaContest.id)
    .eq("resolution_type", "bspitw");

  if (!bspitwPrizes || bspitwPrizes.length === 0) return null;

  // Resolve each BSPITW prize (typically just one)
  for (const prize of bspitwPrizes) {
    const result = await resolveWinnersForPrize(supabase, prize.id, adminId);
    return result; // Return first result
  }

  return null;
}

/**
 * Clear all winners for prizes linked to a specific contest.
 * Called when a contest is unverified.
 */
export async function clearWinnersForContest(
  supabase: SupabaseClient,
  contestId: string
): Promise<void> {
  const { data: prizes } = await supabase
    .from("calcutta_prizes")
    .select("id")
    .eq("linked_contest_id", contestId);

  if (!prizes) return;

  for (const prize of prizes) {
    await clearWinnersForPrize(supabase, prize.id);
  }
}

/**
 * Send notifications to calcutta owners when their players win.
 */
async function notifyOwners(
  supabase: SupabaseClient,
  prize: { contest_id: string; prize_name: string | null; linked_contest_id: string | null; percentage: number; per_player: boolean; player_count: number },
  winnerUserIds: string[]
): Promise<void> {
  // Get the prize display name
  let prizeName = prize.prize_name;
  if (!prizeName && prize.linked_contest_id) {
    const { data: linkedContest } = await supabase
      .from("contests")
      .select("name")
      .eq("id", prize.linked_contest_id)
      .single();
    prizeName = linkedContest?.name || "Contest";
  }

  // Calculate the pool
  const { data: participants } = await supabase
    .from("contest_participants")
    .select("bid_amount")
    .eq("contest_id", prize.contest_id)
    .not("bid_amount", "is", null);

  const pool = (participants || []).reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);
  const totalPayout = pool * prize.percentage / 100;
  const winnerCount = winnerUserIds.length;
  const perPlayerPayout = winnerCount > 0 ? totalPayout / winnerCount : 0;

  // Fetch ownership for each winner
  const { data: ownership } = await supabase
    .from("calcutta_ownership")
    .select("owner_id, share_pct, participant:contest_participants!inner(user_id)")
    .eq("participant.contest_id", prize.contest_id);

  if (!ownership) return;

  // Get winner display names
  const { data: winnerUsers } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", winnerUserIds);

  const winnerNameMap: Record<string, string> = {};
  for (const u of winnerUsers || []) {
    winnerNameMap[u.id] = u.display_name;
  }

  // Group payouts by owner
  const ownerPayouts: Record<string, { total: number; players: string[] }> = {};

  for (const o of ownership) {
    const participant = Array.isArray(o.participant) ? o.participant[0] : o.participant;
    const userId = participant?.user_id;
    if (!userId || !winnerUserIds.includes(userId)) continue;

    const ownerPayout = perPlayerPayout * (o.share_pct / 100);
    if (!ownerPayouts[o.owner_id]) {
      ownerPayouts[o.owner_id] = { total: 0, players: [] };
    }
    ownerPayouts[o.owner_id].total += ownerPayout;
    ownerPayouts[o.owner_id].players.push(winnerNameMap[userId] || "Unknown");
  }

  // Send notification to each owner
  for (const [ownerId, payout] of Object.entries(ownerPayouts)) {
    const playerNames = payout.players.join(", ");
    await sendNotification(ownerId, {
      type: "calcutta_payout",
      title: "Calcutta Payout!",
      body: `Your player${payout.players.length > 1 ? "s" : ""} ${playerNames} won ${prizeName}! You earned $${payout.total.toFixed(2)}.`,
      data: { prize_name: prizeName, payout: payout.total },
    });
  }
}
