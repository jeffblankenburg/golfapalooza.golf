import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attendance -> contest auto-enrollment (issue #137).
 *
 * The sibling to `option-contest-sync.ts`: where that helper wires an
 * explicit option opt-in to a contest, this one wires plain trip
 * attendance to the "everybody plays" contests — Calcutta, the per-day
 * Scramble, and the KGB Cup. Any contest with
 * `contests.auto_enroll_attendees = true` gets every on-roster Loozer
 * mirrored into `contest_participants`.
 *
 * Enroll direction is purely additive and idempotent. Removal is guarded:
 * we refuse to delete a participant whose row (or related team/pair) carries
 * scoring or bidding state a human needs to unwind by hand.
 */

export interface AttendanceSyncWarning {
  contestId: string;
  contestName: string;
  reason: string;
}

export interface AttendanceSyncResult {
  enrolled: string[]; // contest ids the user was added to
  removed: string[]; // contest ids the user was removed from
  skipped: string[]; // contest ids skipped (already enrolled / excluded)
  warnings: AttendanceSyncWarning[]; // removals refused to protect state
}

/**
 * Return the set of auto-enroll contests for a trip that carry protected
 * state for `userId` — i.e. removing the participant would orphan a
 * Calcutta bid/ownership, a scramble team seat, or a KGB Cup pairing.
 * Keyed by contest id -> human reason.
 */
async function protectedContests(
  adminClient: SupabaseClient,
  contests: Array<{ id: string; name: string; contest_type: string }>,
  userId: string,
): Promise<Map<string, string>> {
  const guarded = new Map<string, string>();
  const contestIds = contests.map((c) => c.id);
  if (contestIds.length === 0) return guarded;

  // Calcutta: a participant row with a bid or an owner is live auction state.
  const { data: bids } = await adminClient
    .from("contest_participants")
    .select("contest_id, bid_amount, owner_id")
    .eq("user_id", userId)
    .in("contest_id", contestIds);
  for (const row of bids || []) {
    if (row.bid_amount != null || row.owner_id != null) {
      guarded.set(row.contest_id, "has a Calcutta bid or owns an auction lot");
    }
  }
  // Calcutta ownership can also be a buyback share pointing at *another*
  // participant row in these contests.
  const { data: parts } = await adminClient
    .from("contest_participants")
    .select("id, contest_id")
    .in("contest_id", contestIds);
  const partIdToContest = new Map((parts || []).map((p) => [p.id, p.contest_id]));
  if (partIdToContest.size > 0) {
    const { data: owns } = await adminClient
      .from("calcutta_ownership")
      .select("participant_id")
      .eq("owner_id", userId)
      .in("participant_id", Array.from(partIdToContest.keys()));
    for (const o of owns || []) {
      const cid = partIdToContest.get(o.participant_id);
      if (cid) guarded.set(cid, "owns a Calcutta share");
    }
  }

  // Scramble: seated on a team in one of these contests.
  const { data: scrambleTeams } = await adminClient
    .from("scramble_teams")
    .select("id, contest_id")
    .in("contest_id", contestIds);
  const scrambleTeamToContest = new Map((scrambleTeams || []).map((t) => [t.id, t.contest_id]));
  if (scrambleTeamToContest.size > 0) {
    const { data: members } = await adminClient
      .from("scramble_team_members")
      .select("team_id")
      .eq("user_id", userId)
      .in("team_id", Array.from(scrambleTeamToContest.keys()));
    for (const m of members || []) {
      const cid = scrambleTeamToContest.get(m.team_id);
      if (cid) guarded.set(cid, "is on a scramble team");
    }
  }

  // KGB Cup: named in a ryder cup pairing.
  const { data: ryderTeams } = await adminClient
    .from("ryder_cup_teams")
    .select("id, contest_id")
    .in("contest_id", contestIds);
  const ryderTeamToContest = new Map((ryderTeams || []).map((t) => [t.id, t.contest_id]));
  if (ryderTeamToContest.size > 0) {
    const teamIds = Array.from(ryderTeamToContest.keys());
    const { data: pairs } = await adminClient
      .from("ryder_cup_pairs")
      .select("team_id, player_a_id, player_b_id, player_c_id")
      .in("team_id", teamIds)
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId},player_c_id.eq.${userId}`);
    for (const p of pairs || []) {
      const cid = ryderTeamToContest.get(p.team_id);
      if (cid) guarded.set(cid, "is in a KGB Cup pairing");
    }
  }

  return guarded;
}

/**
 * Mirror a Loozer's trip attendance into every `auto_enroll_attendees`
 * contest on the trip.
 *
 * @param onRoster - the *new* value of event_participants.on_roster.
 *   true  -> upsert into every auto-enroll contest (unless a manual-removal
 *            tombstone exists in contest_enrollment_exclusions).
 *   false -> remove from every auto-enroll contest, refusing (and warning)
 *            where protected state exists.
 *
 * Never touches `pickem_payments` — auto-enroll contests are never Pickem,
 * and we must not fabricate an entry-fee-paid row (edge case in #137).
 * Idempotent; safe to run alongside `syncContestEnrollment`.
 */
export async function syncAttendanceEnrollment(
  adminClient: SupabaseClient,
  tripId: string,
  userId: string,
  onRoster: boolean,
): Promise<AttendanceSyncResult> {
  const result: AttendanceSyncResult = { enrolled: [], removed: [], skipped: [], warnings: [] };

  const { data: contests } = await adminClient
    .from("contests")
    .select("id, name, contest_type")
    .eq("trip_id", tripId)
    .eq("auto_enroll_attendees", true);
  if (!contests || contests.length === 0) return result;

  if (onRoster) {
    // Respect manual de-enroll tombstones: never auto-re-add someone who
    // explicitly opted out of a contest while staying on the trip.
    const { data: exclusions } = await adminClient
      .from("contest_enrollment_exclusions")
      .select("contest_id")
      .eq("user_id", userId)
      .in("contest_id", contests.map((c) => c.id));
    const excluded = new Set((exclusions || []).map((e) => e.contest_id));

    const toAdd = contests.filter((c) => !excluded.has(c.id));
    if (toAdd.length > 0) {
      const { error } = await adminClient
        .from("contest_participants")
        .upsert(
          toAdd.map((c) => ({ contest_id: c.id, user_id: userId })),
          { onConflict: "contest_id,user_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    result.enrolled = toAdd.map((c) => c.id);
    result.skipped = contests.filter((c) => excluded.has(c.id)).map((c) => c.id);
    return result;
  }

  // Leaving the roster: guarded removal.
  const guarded = await protectedContests(adminClient, contests, userId);
  const removable = contests.filter((c) => !guarded.has(c.id));

  for (const c of contests) {
    const reason = guarded.get(c.id);
    if (reason) {
      result.warnings.push({ contestId: c.id, contestName: c.name, reason });
    }
  }

  if (removable.length > 0) {
    const { error } = await adminClient
      .from("contest_participants")
      .delete()
      .eq("user_id", userId)
      .in("contest_id", removable.map((c) => c.id));
    if (error) throw error;
    result.removed = removable.map((c) => c.id);
  }

  return result;
}

/**
 * Record an explicit manual de-enrollment so future attendance syncs won't
 * re-add the user. Call this from the "remove me from Calcutta" gestures
 * (as opposed to a full roster leave). Also deletes the live participant row.
 */
export async function excludeFromContest(
  adminClient: SupabaseClient,
  contestId: string,
  userId: string,
  removedBy: string | null,
  reason: string | null,
): Promise<void> {
  await adminClient
    .from("contest_enrollment_exclusions")
    .upsert(
      { contest_id: contestId, user_id: userId, removed_by: removedBy, reason },
      { onConflict: "contest_id,user_id" },
    );
  await adminClient
    .from("contest_participants")
    .delete()
    .eq("contest_id", contestId)
    .eq("user_id", userId);
}

/**
 * Clear a manual de-enrollment tombstone. Call when a Loozer opts back into
 * a contest they'd previously removed themselves from — the next attendance
 * sync (or an immediate upsert) will then re-add them.
 */
export async function clearContestExclusion(
  adminClient: SupabaseClient,
  contestId: string,
  userId: string,
): Promise<void> {
  await adminClient
    .from("contest_enrollment_exclusions")
    .delete()
    .eq("contest_id", contestId)
    .eq("user_id", userId);
}
