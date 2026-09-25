import type { SupabaseClient } from "@supabase/supabase-js";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { orgSlug, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import { formatCourseName } from "@/lib/v2/course-display";

/**
 * Roster-based round notifications (#186). Best-effort — a notification failure
 * must never block the write that triggered it, so everything is wrapped in
 * try/catch. Org scoping: notifications route through `round.org_id` (the group the
 * round was logged under). Org-less / historical rounds (org_id NULL) don't notify.
 */

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

async function actorName(admin: SupabaseClient, actorUserId: string, orgId: string): Promise<string> {
  const { data: actor } = await admin
    .from("v2_profiles")
    .select("display_name, first_name, last_name, nickname")
    .eq("id", actorUserId)
    .maybeSingle();
  return actor ? pickName(actor, await orgNameMode(admin, orgId), "Someone") : "Someone";
}

/**
 * round_invite — ping every freshly-added player except the actor, deep-linking to
 * the scorer. Guests (no user_id) are filtered out by the caller.
 */
export async function notifyRoundInvite(
  admin: SupabaseClient,
  { roundId, playerUserIds, actorUserId }: { roundId: string; playerUserIds: string[]; actorUserId: string },
): Promise<void> {
  try {
    const recipients = [...new Set(playerUserIds)].filter((id) => id && id !== actorUserId);
    if (recipients.length === 0) return;

    const { data: round } = await admin
      .from("v2_rounds")
      .select("id, org_id, course:v2_courses(name, club_name), tee:v2_course_tees(tee_name, tee_color)")
      .eq("id", roundId)
      .maybeSingle();
    if (!round?.org_id) return;
    const slug = await orgSlug(admin, round.org_id);
    if (!slug) return;

    const course = one(round.course);
    const tee = one(round.tee);
    const courseName = course ? formatCourseName(course) : "a round";
    const teeName = tee?.tee_name || tee?.tee_color || null;
    const name = await actorName(admin, actorUserId, round.org_id);

    await sendV2Notifications(admin, recipients, {
      orgId: round.org_id,
      type: "round_invite",
      title: `${name} added you to a round`,
      body: teeName ? `${courseName} (${teeName})` : courseName,
      data: { url: `/new/${slug}/rounds/${roundId}/score`, roundId },
    });
  } catch {
    // swallow — never block round creation on a notification failure
  }
}

/**
 * round_comment / round_mention — on a new comment, notify roster players (except
 * the commenter) with round_comment, and any @mentioned members with round_mention
 * (a mentioned roster player gets the mention, not the comment). Mentions can reach
 * non-players (any group member), so both deep-link to the standalone round page
 * with comments auto-expanded.
 */
export async function notifyRoundComment(
  admin: SupabaseClient,
  { roundId, body, actorUserId }: { roundId: string; body: string | null; actorUserId: string },
): Promise<void> {
  try {
    const { data: round } = await admin
      .from("v2_rounds")
      .select("id, org_id, course:v2_courses(name, club_name), players:v2_round_players(user_id)")
      .eq("id", roundId)
      .maybeSingle();
    if (!round?.org_id) return;
    const slug = await orgSlug(admin, round.org_id);
    if (!slug) return;

    const roster = (round.players || []).map((p) => p.user_id).filter((id): id is string => !!id);

    const mentioned = new Set<string>();
    for (const m of (body || "").matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)) mentioned.add(m[1]);

    const mentionRecipients = [...mentioned].filter((id) => id && id !== actorUserId);
    const commentRecipients = roster.filter((id) => id !== actorUserId && !mentioned.has(id));
    if (mentionRecipients.length === 0 && commentRecipients.length === 0) return;

    const clean = (body || "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
    const preview = clean.trim() ? clean.trim().slice(0, 80) : "📷 Photo";
    const course = one(round.course);
    const courseName = course ? formatCourseName(course) : "a round";
    const name = await actorName(admin, actorUserId, round.org_id);
    const data = { url: `/new/${slug}/rounds/${roundId}?c=1`, roundId };

    await Promise.all([
      mentionRecipients.length
        ? sendV2Notifications(admin, mentionRecipients, {
            orgId: round.org_id,
            type: "round_mention",
            title: courseName,
            body: `${name} mentioned you: ${preview}`,
            data,
          })
        : Promise.resolve(),
      commentRecipients.length
        ? sendV2Notifications(admin, commentRecipients, {
            orgId: round.org_id,
            type: "round_comment",
            title: courseName,
            body: `${name}: ${preview}`,
            data,
          })
        : Promise.resolve(),
    ]);
  } catch {
    // swallow — never block a comment on a notification failure
  }
}
