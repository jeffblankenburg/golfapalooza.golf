/**
 * Contest enrollment sync (#215, epic #214).
 *
 * Two lanes reach a member (see #214): "Included" contests (`v2_contests.auto_enroll`)
 * auto-enroll every on-roster member; "Optional" contests are opt-in (that lane lands
 * with the Options layer, #216). This module owns the Included lane + manual admin
 * add/remove.
 *
 * Load-bearing principle: `v2_contest_participants` is the AUTHORITATIVE roster for a
 * contest. Attendance only *seeds* it — it never constrains it. Admins add anyone
 * (even non-attendees — a local drop-in) and remove anyone (even attendees — someone
 * who left early), and nothing here blocks that. Removal writes an exclusion tombstone
 * so the next attendance sync doesn't silently re-add them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendV2Notifications } from "@/lib/v2/notifications";

/** Contest ids in an event that auto-enroll on-roster members ("Included" contests). */
export async function autoEnrollContestIds(admin: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await admin
    .from("v2_contests")
    .select("id")
    .eq("event_id", eventId)
    .eq("auto_enroll", true);
  return (data || []).map((c) => c.id as string);
}

/**
 * Enroll one member into every Included contest of an event, skipping contests they
 * have an exclusion tombstone for. Additive only — the removal/guard path is #217.
 * Call when a member becomes `on_roster` (RSVP "Attending" or admin attendance write).
 * Returns the contest ids they were (or already are) enrolled in.
 */
export async function syncAttendanceEnrollment(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
  onRoster: boolean,
): Promise<{ enrolled: string[] }> {
  if (!onRoster) return { enrolled: [] }; // leaving-the-roster cascade is #217

  const contestIds = await autoEnrollContestIds(admin, eventId);
  if (contestIds.length === 0) return { enrolled: [] };

  const { data: excl } = await admin
    .from("v2_contest_enrollment_exclusions")
    .select("contest_id")
    .eq("user_id", userId)
    .in("contest_id", contestIds);
  const excluded = new Set((excl || []).map((e) => e.contest_id as string));

  const targets = contestIds.filter((id) => !excluded.has(id));
  if (targets.length === 0) return { enrolled: [] };

  const rows = targets.map((contest_id) => ({ contest_id, user_id: userId }));
  await admin.from("v2_contest_participants").upsert(rows, { onConflict: "contest_id,user_id", ignoreDuplicates: true });
  return { enrolled: targets };
}

/** A scramble team left with an empty seat by a member's departure (#217). */
export interface RosterBreak {
  contestId: string;
  contestName: string;
  teamId: string;
  teamName: string | null;
}

/**
 * The leave-the-roster cascade (#217). A member who's no longer attending (dropped
 * below "Attending" or cleared their RSVP) comes off everything they were only in by
 * virtue of attending:
 *   - every auto-enroll ("Included") contest they're in — removed WITHOUT a tombstone,
 *     so re-RSVPing "Attending" re-enrolls them additively (per #215);
 *   - every scramble team seat they hold — removed, and the team flagged
 *     `needs_attention_at` so an admin fixes the empty seat;
 *   - every opt-in Option they selected for the event — selection deleted (which
 *     reverses the derived charge) and the option's contest enrollment reversed.
 * Never blocks. Returns the broken teams so the caller can alert admins.
 */
export async function cascadeLeaveRoster(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<{ removedContestIds: string[]; breaks: RosterBreak[] }> {
  const nowIso = new Date().toISOString();

  // 1. Included contests they're in → remove (no tombstone; re-attend re-adds).
  const autoIds = await autoEnrollContestIds(admin, eventId);
  let removedContestIds: string[] = [];
  if (autoIds.length) {
    const { data: mine } = await admin
      .from("v2_contest_participants").select("contest_id").eq("user_id", userId).in("contest_id", autoIds);
    removedContestIds = [...new Set((mine || []).map((r) => r.contest_id as string))];
    if (removedContestIds.length) {
      await admin.from("v2_contest_participants").delete().eq("user_id", userId).in("contest_id", removedContestIds);
    }
  }

  // 2. Scramble team seats across this event's contests → remove + flag the team.
  const breaks: RosterBreak[] = [];
  const { data: evContests } = await admin.from("v2_contests").select("id, name").eq("event_id", eventId);
  const contestName = new Map((evContests || []).map((c) => [c.id as string, c.name as string]));
  const contestIds = (evContests || []).map((c) => c.id as string);
  if (contestIds.length) {
    const { data: teams } = await admin
      .from("v2_scramble_teams").select("id, name, contest_id").in("contest_id", contestIds);
    const teamById = new Map((teams || []).map((t) => [t.id as string, t]));
    const teamIds = (teams || []).map((t) => t.id as string);
    if (teamIds.length) {
      const { data: seats } = await admin
        .from("v2_scramble_team_members").select("team_id").eq("user_id", userId).in("team_id", teamIds);
      const seatTeamIds = [...new Set((seats || []).map((s) => s.team_id as string))];
      if (seatTeamIds.length) {
        await admin.from("v2_scramble_team_members").delete().eq("user_id", userId).in("team_id", seatTeamIds);
        await admin.from("v2_scramble_teams").update({ needs_attention_at: nowIso, updated_at: nowIso }).in("id", seatTeamIds);
        for (const tid of seatTeamIds) {
          const t = teamById.get(tid);
          if (t) breaks.push({ contestId: t.contest_id as string, contestName: contestName.get(t.contest_id as string) || "Contest", teamId: tid, teamName: (t.name as string | null) ?? null });
        }
      }
    }
  }

  // NOTE: Options are INDEPENDENT of attendance (v1 parity) — leaving the roster does
  // NOT touch a member's option selections. Only attendance-driven enrollment (Included
  // contests + their team seats) cascades off here.

  return { removedContestIds, breaks };
}

/**
 * Alert org admins that a member's departure broke a team (#217). In-app + push to
 * every active owner/admin, deep-linked to the affected contest's Teams page.
 * Best-effort: a notification failure never blocks the attendance write.
 */
export async function alertRosterBreaks(
  admin: SupabaseClient,
  orgId: string,
  slug: string,
  eventId: string,
  memberName: string,
  breaks: RosterBreak[],
): Promise<void> {
  if (!breaks.length) return;
  const { data: admins } = await admin
    .from("v2_memberships").select("user_id")
    .eq("org_id", orgId).in("role", ["owner", "admin"]).eq("status", "active").is("archived_at", null);
  const adminIds = (admins || []).map((a) => a.user_id as string);
  if (!adminIds.length) return;

  for (const b of breaks) {
    await sendV2Notifications(admin, adminIds, {
      orgId,
      type: "contest_roster_break",
      title: `${memberName} left, a team needs attention`,
      body: `${b.teamName || "A team"} in ${b.contestName} now has an empty seat.`,
      data: { url: `/new/${slug}/admin/events/${eventId}/contests/${b.contestId}/teams` },
    }).catch(() => {});
  }
}

/**
 * Enroll on-roster members into ONE contest (import-all), skipping anyone tombstoned
 * for it. Used when a contest becomes Included (created in / reconciled into Trip
 * Cost) or from the "Import attendees → all" action. Returns the number targeted.
 */
export async function enrollRosterIntoContest(
  admin: SupabaseClient,
  contestId: string,
  eventId: string,
): Promise<number> {
  const { data: roster } = await admin
    .from("v2_event_participants")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("on_roster", true);
  let userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length === 0) return 0;

  const { data: excl } = await admin
    .from("v2_contest_enrollment_exclusions")
    .select("user_id")
    .eq("contest_id", contestId);
  const excluded = new Set((excl || []).map((e) => e.user_id as string));
  userIds = userIds.filter((id) => !excluded.has(id));
  if (userIds.length === 0) return 0;

  const rows = userIds.map((user_id) => ({ contest_id: contestId, user_id }));
  await admin.from("v2_contest_participants").upsert(rows, { onConflict: "contest_id,user_id", ignoreDuplicates: true });
  return userIds.length;
}

/**
 * Add specific members to a contest (manual admin add / subset import). Accepts
 * members who are NOT on the roster (the local drop-in). Clears any exclusion
 * tombstones for them so they're treated as intentionally in.
 */
export async function addContestParticipants(
  admin: SupabaseClient,
  contestId: string,
  userIds: string[],
): Promise<number> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;

  const rows = ids.map((user_id) => ({ contest_id: contestId, user_id }));
  const { error } = await admin
    .from("v2_contest_participants")
    .upsert(rows, { onConflict: "contest_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  // A deliberate add overrides any prior opt-out.
  await admin
    .from("v2_contest_enrollment_exclusions")
    .delete()
    .eq("contest_id", contestId)
    .in("user_id", ids);
  return ids.length;
}

/**
 * Remove specific members from a contest and tombstone them so attendance-sync won't
 * re-add. Never blocked — surfacing downstream breakage (team seats, etc.) is #217.
 */
export async function removeContestParticipants(
  admin: SupabaseClient,
  contestId: string,
  userIds: string[],
  removedBy: string | null,
  reason?: string | null,
): Promise<number> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;

  const { error } = await admin
    .from("v2_contest_participants")
    .delete()
    .eq("contest_id", contestId)
    .in("user_id", ids);
  if (error) throw new Error(error.message);

  // Someone removed from the contest can't stay on its scramble teams — pull their
  // seats and flag any team that lost one so it shows "needs attention" (#217).
  const { data: teams } = await admin.from("v2_scramble_teams").select("id").eq("contest_id", contestId);
  const teamIds = (teams || []).map((t) => t.id as string);
  if (teamIds.length) {
    const { data: seats } = await admin
      .from("v2_scramble_team_members").select("team_id").in("user_id", ids).in("team_id", teamIds);
    const hitTeams = [...new Set((seats || []).map((s) => s.team_id as string))];
    if (hitTeams.length) {
      await admin.from("v2_scramble_team_members").delete().in("user_id", ids).in("team_id", hitTeams);
      const nowIso = new Date().toISOString();
      await admin.from("v2_scramble_teams").update({ needs_attention_at: nowIso, updated_at: nowIso }).in("id", hitTeams);
    }
  }

  const tombstones = ids.map((user_id) => ({
    contest_id: contestId,
    user_id,
    removed_by: removedBy,
    reason: reason ?? null,
    removed_at: new Date().toISOString(),
  }));
  await admin
    .from("v2_contest_enrollment_exclusions")
    .upsert(tombstones, { onConflict: "contest_id,user_id" });
  return ids.length;
}
