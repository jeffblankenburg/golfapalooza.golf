/**
 * Issue #124 — write canonical winner rows into `contest_winners` from
 * each contest type's source-of-truth tables.
 *
 * Each materializer is idempotent and preserves the `paid` flag across
 * re-runs (so admin's payment marks survive recomputation when scoring
 * shifts a winner).
 *
 * The write path is "compute desired set → diff against existing →
 * delete obsolete rows → insert new rows." Existing rows whose
 * (contest_id, place, user_id) match the desired set are left untouched.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveScrambleWinner } from "./scramble";
import { computePayoutSplits, type PayoutSplit } from "@/lib/payout-events/splits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

interface WinnerRow {
  contest_id: string;
  place: number;
  user_id: string;
  amount: number;
  partner_user_id?: string | null;
  notes?: string | null;
  determined_by?: "rule" | "manual" | "derived";
}

/**
 * Reconcile the desired winners for a contest against existing rows.
 * Rules:
 *   - Existing row with matching (contest_id, place, user_id) is updated
 *     in place if amount/notes changed, preserving `paid`/`paid_at`/`paid_by`.
 *   - Existing rows not in the desired set are deleted.
 *   - Desired rows without a match are inserted.
 *
 * The point of preserving `paid` across reconciles is so that admin's
 * payout marks survive when scoring shifts a winner around.
 */
async function reconcileWinners(
  client: Client,
  contestId: string,
  desired: WinnerRow[],
): Promise<void> {
  const { data: existing, error: existErr } = await client
    .from("contest_winners")
    .select("id, place, user_id, amount, notes")
    .eq("contest_id", contestId);
  if (existErr) throw new Error(`reconcileWinners load: ${existErr.message}`);

  const desiredKeys = new Set(desired.map((d) => `${d.place}|${d.user_id}`));
  const existingByKey = new Map(
    (existing || []).map((e) => [`${e.place}|${e.user_id}`, e]),
  );

  const obsolete = (existing || []).filter(
    (e) => !desiredKeys.has(`${e.place}|${e.user_id}`),
  );
  if (obsolete.length > 0) {
    const { error: delErr } = await client
      .from("contest_winners")
      .delete()
      .in(
        "id",
        obsolete.map((o) => o.id),
      );
    if (delErr) throw new Error(`reconcileWinners delete: ${delErr.message}`);
  }

  // Insert + update in two passes (PostgREST doesn't have a clean
  // update-in-place by composite key without bumping `paid`/etc.).
  const toInsert: WinnerRow[] = [];
  const toUpdate: Array<{ id: string; amount: number; notes: string | null }> = [];
  for (const d of desired) {
    const ex = existingByKey.get(`${d.place}|${d.user_id}`);
    if (!ex) {
      toInsert.push(d);
    } else if (
      Number(ex.amount ?? 0) !== d.amount ||
      (ex.notes ?? null) !== (d.notes ?? null)
    ) {
      toUpdate.push({ id: ex.id, amount: d.amount, notes: d.notes ?? null });
    }
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((d) => ({
      contest_id: d.contest_id,
      place: d.place,
      user_id: d.user_id,
      amount: d.amount,
      partner_user_id: d.partner_user_id ?? null,
      notes: d.notes ?? null,
      determined_by: d.determined_by ?? "rule",
    }));
    const { error: insErr } = await client.from("contest_winners").insert(rows);
    if (insErr) throw new Error(`reconcileWinners insert: ${insErr.message}`);
  }
  for (const u of toUpdate) {
    const { error: updErr } = await client
      .from("contest_winners")
      .update({ amount: u.amount, notes: u.notes })
      .eq("id", u.id);
    if (updErr) throw new Error(`reconcileWinners update: ${updErr.message}`);
  }
}

/**
 * Pot for a contest = participant_count × buy_in_cost_item.cost. Returns
 * `{ pot, splits }` so materializers can compute per-place amounts via
 * `computePayoutSplits`.
 */
async function loadContestPotAndSplits(
  client: Client,
  contestId: string,
): Promise<{ pot: number; splits: PayoutSplit[] | null }> {
  const { data: contest } = await client
    .from("contests")
    .select(
      "payout_splits, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)",
    )
    .eq("id", contestId)
    .single();
  if (!contest) return { pot: 0, splits: null };

  const ci = Array.isArray(contest.buy_in_cost_item)
    ? contest.buy_in_cost_item[0]
    : contest.buy_in_cost_item;
  const perParticipant = Number((ci as { cost?: number | string } | null)?.cost ?? 0);
  if (!perParticipant) return { pot: 0, splits: contest.payout_splits ?? null };

  const { count } = await client
    .from("contest_participants")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contestId);
  return {
    pot: Math.round(perParticipant * (count ?? 0) * 100) / 100,
    splits: contest.payout_splits ?? null,
  };
}

/**
 * Daily contests (ctp_front, ctp_back, long_drive, long_putt). Source of
 * truth is now `contest_winners` itself (issue #124 Phase F dropped the
 * legacy `daily_contest_winners` table). Admin writes the user_id via
 * `/api/admin/daily-winners` PUT; this materializer just refreshes the
 * `amount` column from the current pot × splits.
 */
export async function materializeDailyContestWinner(
  client: Client,
  contestId: string,
): Promise<void> {
  const { data: existing } = await client
    .from("contest_winners")
    .select("user_id, amount")
    .eq("contest_id", contestId)
    .eq("place", 1)
    .maybeSingle();
  if (!existing) return;

  const { pot, splits } = await loadContestPotAndSplits(client, contestId);
  const placeAmounts = computePayoutSplits(pot, splits);
  await reconcileWinners(client, contestId, [
    {
      contest_id: contestId,
      place: 1,
      user_id: existing.user_id,
      amount: placeAmounts.get(1) ?? pot,
    },
  ]);
}

/**
 * Scramble Team — top 2 net (gross_score - team_handicap). Each team
 * member gets a row at the team's place. Tiebreaks are handled by
 * `resolveScrambleWinner` (handicap scorecard playoff).
 */
export async function materializeScrambleTeamWinners(
  client: Client,
  contestId: string,
): Promise<void> {
  const { pot, splits } = await loadContestPotAndSplits(client, contestId);
  const placeAmounts = computePayoutSplits(pot, splits);

  const desired: WinnerRow[] = [];
  for (const place of [1, 2]) {
    const result = await resolveScrambleWinner(client, contestId, place);
    if (!result) break;
    const teamSize = result.userIds.length || 1;
    const placeTotal = placeAmounts.get(place) ?? 0;
    const perUser = Math.round((placeTotal / teamSize) * 100) / 100;
    for (const userId of result.userIds) {
      desired.push({
        contest_id: contestId,
        place,
        user_id: userId,
        amount: perUser,
        notes: result.tiebreaker || null,
      });
    }
  }
  await reconcileWinners(client, contestId, desired);
}

/**
 * Scramble Skins — pot is divided proportional to each team's skin count.
 * One row per team-member at place=1; the share itself is computed at
 * payout time from `payout_splits` (skins_proportional kind).
 *
 * `contestId` here is the SKINS contest (the child); we walk up to its
 * parent via `parent_contest_id` to find the scramble whose teams +
 * scores feed `calcSkins`.
 *
 * If the parent scramble has no scores yet (or no teams), we materialize
 * an empty winner set — admin's "skins, no current winners" state.
 */
export async function materializeSkinsWinners(
  client: Client,
  skinsContestId: string,
): Promise<void> {
  const { data: skinsContest } = await client
    .from("contests")
    .select("parent_contest_id, trip:trip_settings!inner(course_id)")
    .eq("id", skinsContestId)
    .single();
  if (!skinsContest?.parent_contest_id) return;

  const parentContestId = skinsContest.parent_contest_id;
  const courseId = (skinsContest.trip as unknown as { course_id: string } | null)?.course_id;
  if (!courseId) return;

  // Fetch teams (with handicap) and members for the parent scramble.
  const [teamsRes, membersRes, teeAssignmentsRes] = await Promise.all([
    client
      .from("scramble_teams")
      .select("id, team_handicap")
      .eq("contest_id", parentContestId),
    client
      .from("scramble_team_members")
      .select("team_id, user_id"),
    client
      .from("contest_hole_tees")
      .select("hole_number, tee_id, handicap_index_override")
      .eq("contest_id", parentContestId),
  ]);

  const teams = (teamsRes.data || []) as Array<{ id: string; team_handicap: number }>;
  if (teams.length === 0) {
    await reconcileWinners(client, skinsContestId, []);
    return;
  }
  const teamIds = teams.map((t) => t.id);
  const teamMembers = (membersRes.data || []).filter((m) => teamIds.includes(m.team_id));

  const teeAssignments = (teeAssignmentsRes.data || []) as Array<{
    hole_number: number;
    tee_id: string;
    handicap_index_override: number | null;
  }>;

  // No tee assignments → can't compute net skins.
  if (teeAssignments.length === 0) {
    await reconcileWinners(client, skinsContestId, []);
    return;
  }

  // All-or-nothing handicap_index overrides (matches scramble.ts logic).
  const overridesActive =
    teeAssignments.length === 18 &&
    teeAssignments.every((ta) => typeof ta.handicap_index_override === "number");

  const teeIds = [...new Set(teeAssignments.map((ta) => ta.tee_id))];
  const { data: courseHoles } = await client
    .from("course_holes")
    .select("tee_id, hole_number, handicap_index")
    .eq("course_id", courseId)
    .in("tee_id", teeIds);

  const hcMap = new Map<string, number>();
  for (const h of courseHoles || []) {
    hcMap.set(`${h.tee_id}-${h.hole_number}`, h.handicap_index);
  }

  const holes = teeAssignments.map((ta) => ({
    hole_number: ta.hole_number,
    handicap_index:
      overridesActive && typeof ta.handicap_index_override === "number"
        ? ta.handicap_index_override
        : hcMap.get(`${ta.tee_id}-${ta.hole_number}`) || 0,
  }));

  // Hole scores for the parent scramble's teams.
  const { data: scoresRows } = await client
    .from("scramble_hole_scores")
    .select("team_id, hole_number, strokes")
    .in("team_id", teamIds);

  const holeScores: Record<string, Record<number, number>> = {};
  for (const r of scoresRows || []) {
    if (!holeScores[r.team_id]) holeScores[r.team_id] = {};
    holeScores[r.team_id][r.hole_number] = r.strokes;
  }

  const { calcSkins } = await import("@/lib/skins");
  const result = calcSkins(teams, holes, holeScores);

  if (result.totalSkins === 0) {
    await reconcileWinners(client, skinsContestId, []);
    return;
  }

  const { pot } = await loadContestPotAndSplits(client, skinsContestId);
  // Skins is always all-pot-place-1 (skins_proportional). Distribute the
  // pot proportionally to each team's skin count, then split each team's
  // share equally among its members.
  const teamSizeById = new Map<string, number>();
  for (const m of teamMembers) {
    teamSizeById.set(m.team_id, (teamSizeById.get(m.team_id) ?? 0) + 1);
  }

  const desired: WinnerRow[] = [];
  for (const m of teamMembers) {
    const skinCount = result.skinCounts.get(m.team_id) ?? 0;
    if (skinCount === 0) continue;
    const teamSize = teamSizeById.get(m.team_id) || 1;
    const teamShare = (skinCount / result.totalSkins) * pot;
    const perUser = Math.round((teamShare / teamSize) * 100) / 100;
    desired.push({
      contest_id: skinsContestId,
      place: 1,
      user_id: m.user_id,
      amount: perUser,
      notes: `${skinCount} skin${skinCount === 1 ? "" : "s"}`,
    });
  }
  await reconcileWinners(client, skinsContestId, desired);
}

/**
 * 100 Feet — single winner = lowest cumulative distance-from-cup across
 * the three scramble days. Score is stored per (trip, user, day_number)
 * as `feet` + `inches`; we sum to total inches for ranking.
 *
 * Default `feet=100, inches=0` is "no successful attempt"; users who
 * never score win nothing here, but the materializer still has to count
 * those as the worst score so they don't accidentally come out on top.
 * That's how the data is shaped — no special handling needed.
 */
export async function materializeHundredFeetWinners(
  client: Client,
  contestId: string,
): Promise<void> {
  const { data: contest } = await client
    .from("contests")
    .select("trip_id")
    .eq("id", contestId)
    .single();
  if (!contest) return;

  const { data: scores } = await client
    .from("hundred_feet_scores")
    .select("user_id, feet, inches")
    .eq("trip_id", contest.trip_id);

  if (!scores || scores.length === 0) {
    await reconcileWinners(client, contestId, []);
    return;
  }

  const totals = new Map<string, number>();
  for (const s of scores) {
    const inches = Number(s.feet || 0) * 12 + Number(s.inches || 0);
    totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + inches);
  }
  let best: { user_id: string; totalInches: number } | null = null;
  for (const [user_id, totalInches] of totals.entries()) {
    if (!best || totalInches < best.totalInches) best = { user_id, totalInches };
  }
  if (!best) {
    await reconcileWinners(client, contestId, []);
    return;
  }
  const { pot, splits } = await loadContestPotAndSplits(client, contestId);
  const placeAmounts = computePayoutSplits(pot, splits);
  const totalFeet = Math.floor(best.totalInches / 12);
  const remInches = best.totalInches % 12;
  await reconcileWinners(client, contestId, [
    {
      contest_id: contestId,
      place: 1,
      user_id: best.user_id,
      amount: placeAmounts.get(1) ?? pot,
      notes: `${totalFeet}'${remInches}" cumulative`,
    },
  ]);
}

/**
 * Pickem — payout structure lives in `contests.payout_splits` (just like
 * every other contest after issue #124). Pickem uses percentages with
 * $5 rounding via `computePickemPayouts`. Tied users at a paying place
 * split the place's amount equally.
 */
export async function materializePickemWinners(
  client: Client,
  contestId: string,
): Promise<void> {
  const { pot, splits } = await loadContestPotAndSplits(client, contestId);
  if (pot <= 0 || !splits || splits.length === 0) {
    await reconcileWinners(client, contestId, []);
    return;
  }

  const { computePickemPayouts } = await import("@/lib/pickem/payouts");
  const payouts = computePickemPayouts(pot, splits);
  const amountByPlace = new Map<number, number>();
  for (const p of payouts) if (p.amount > 0) amountByPlace.set(p.place, p.amount);
  if (amountByPlace.size === 0) {
    await reconcileWinners(client, contestId, []);
    return;
  }
  const maxPayingPlace = Math.max(...amountByPlace.keys());

  const { computePickemRankings } = await import("@/lib/pickem/rankings");
  const ranked = await computePickemRankings(client, contestId);
  if (!ranked || ranked.length === 0) {
    await reconcileWinners(client, contestId, []);
    return;
  }

  // Group ranked users by rank to handle ties.
  const usersByRank = new Map<number, string[]>();
  for (const r of ranked) {
    if (r.rank > maxPayingPlace) continue;
    if (!usersByRank.has(r.rank)) usersByRank.set(r.rank, []);
    usersByRank.get(r.rank)!.push(r.user_id);
  }

  const desired: WinnerRow[] = [];
  const userInfo = new Map(ranked.map((r) => [r.user_id, r]));
  for (const [rank, users] of usersByRank.entries()) {
    const placeAmount = amountByPlace.get(rank) ?? 0;
    const perUser = Math.round((placeAmount / users.length) * 100) / 100;
    for (const userId of users) {
      const r = userInfo.get(userId)!;
      desired.push({
        contest_id: contestId,
        place: rank,
        user_id: userId,
        amount: perUser,
        notes: `${r.correct}/${r.decided} correct`,
      });
    }
  }
  await reconcileWinners(client, contestId, desired);
}

/**
 * Dispatch by contest_type. Used by backfill scripts and lazy-materialize
 * on the Winners grid.
 */
export async function materializeContestWinners(
  client: Client,
  contestId: string,
): Promise<void> {
  const { data: contest } = await client
    .from("contests")
    .select("contest_type")
    .eq("id", contestId)
    .single();
  if (!contest) return;

  switch (contest.contest_type) {
    case "ctp_front":
    case "ctp_back":
    case "long_drive":
    case "long_putt":
      return materializeDailyContestWinner(client, contestId);
    case "scramble":
      return materializeScrambleTeamWinners(client, contestId);
    case "scramble_skins":
      return materializeSkinsWinners(client, contestId);
    case "other":
      // Today the only payout-bearing 'other' contest is "100 Feet!"
      // — a more robust dispatch would add an explicit `hundred_feet`
      // contest_type. For now, dispatch by name as a safety filter.
      const { data: detail } = await client
        .from("contests")
        .select("name")
        .eq("id", contestId)
        .single();
      if (detail?.name?.toLowerCase().includes("feet")) {
        return materializeHundredFeetWinners(client, contestId);
      }
      return;
    case "pickem":
      return materializePickemWinners(client, contestId);
    case "calcutta":
    case "kgb_cup":
    case "ryder_cup":
    case "cornhole_singles":
    case "cornhole_doubles":
      // Calcutta keeps its own prize_id-based rows; KGB/Ryder/Cornhole
      // don't pay out today. No-op.
      return;
    default:
      return;
  }
}
