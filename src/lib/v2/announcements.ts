import type { SupabaseClient } from "@supabase/supabase-js";
import { sendV2Notifications } from "./notifications";

/**
 * Announcement audience + delivery helpers, shared by the /api/v2/announcements
 * routes and the v2-announcements cron so "send now" and scheduled sends resolve
 * recipients and dispatch notifications identically.
 */

export type AnnouncementAudience = "everyone" | "event" | "custom";

export interface AnnouncementRow {
  id: string;
  org_id: string;
  title: string;
  body: string | null;
  audience_type: AnnouncementAudience;
  audience_user_ids: string[] | null;
  event_id: string | null;
}

/**
 * Resolve the set of member user IDs an announcement targets.
 *   everyone → all active org members
 *   event    → event participants who haven't RSVP'd 'not_going'
 *   custom   → the stored audience_user_ids (deduped)
 */
export async function resolveAnnouncementAudience(
  admin: SupabaseClient,
  a: Pick<AnnouncementRow, "org_id" | "audience_type" | "audience_user_ids" | "event_id">,
): Promise<string[]> {
  if (a.audience_type === "custom") {
    return [...new Set((a.audience_user_ids || []).filter(Boolean))];
  }
  if (a.audience_type === "event") {
    if (!a.event_id) return [];
    const { data } = await admin
      .from("v2_event_participants")
      .select("user_id, status")
      .eq("event_id", a.event_id)
      .neq("status", "not_going");
    return [...new Set((data || []).map((p) => p.user_id).filter(Boolean))];
  }
  // everyone
  const { data } = await admin
    .from("v2_memberships")
    .select("user_id")
    .eq("org_id", a.org_id)
    .eq("status", "active");
  return [...new Set((data || []).map((m) => m.user_id).filter(Boolean))];
}

/**
 * Resolve the audience and deliver an announcement as notifications + push.
 * Returns how many members were notified (for the recipient_count snapshot).
 * Announcements are important broadcasts, so there's no per-type opt-out — they
 * always log in-app; push still honors each member's push_master toggle (handled
 * inside sendV2Notifications).
 */
export async function deliverAnnouncement(
  admin: SupabaseClient,
  a: AnnouncementRow,
  slug: string | null,
): Promise<number> {
  const userIds = await resolveAnnouncementAudience(admin, a);
  if (userIds.length) {
    await sendV2Notifications(admin, userIds, {
      orgId: a.org_id,
      type: "announcement",
      title: a.title,
      body: a.body || undefined,
      data: {
        announcementId: a.id,
        ...(slug ? { url: `/new/${slug}` } : {}),
      },
    });
  }
  return userIds.length;
}
