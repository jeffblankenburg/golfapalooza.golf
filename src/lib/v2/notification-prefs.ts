import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Granular notification preferences (Twitter-style): a master push toggle plus a
 * per-event-type toggle, grouped into sections. Opt-out — a missing pref row
 * means enabled.
 *
 * Two axes:
 *   - Per-type toggle  → whether you're notified about that event AT ALL
 *                        (governs both the in-app row and the push).
 *   - Master push      → whether enabled notifications also buzz your device.
 *                        Off = in-app only.
 *
 * Stored in v2_notification_prefs.category as the type key (e.g. "chat_mention")
 * or the special PUSH_MASTER_KEY. Add a type here (mapping it in a section) as new
 * producers ship — the settings modal + enforcement pick it up automatically.
 */

export const PUSH_MASTER_KEY = "push_master";

export interface NotificationTypeItem {
  type: string;
  label: string;
  description: string;
}
export interface NotificationSection {
  key: string;
  label: string;
  items: NotificationTypeItem[];
}

export const NOTIFICATION_SECTIONS: NotificationSection[] = [
  {
    key: "chat",
    label: "Chat",
    items: [
      { type: "chat_message", label: "Messages", description: "New messages in your conversations" },
      { type: "chat_mention", label: "Mentions", description: "When someone @mentions you" },
    ],
  },
  {
    key: "photos",
    label: "Photos",
    items: [
      { type: "gallery_tag", label: "Photo tags", description: "When you're tagged in a photo" },
      { type: "gallery_comment", label: "Photo comments", description: "Comments on a photo you're on" },
    ],
  },
  {
    // Global mute per type. A follower gets a spectator notification only when
    // BOTH the per-follow toggle is on AND the type isn't muted here.
    key: "following",
    label: "Members you follow",
    items: [
      { type: "notify_round_started", label: "Round started", description: "When someone you follow tees off" },
      { type: "notify_hole_completed", label: "Hole-by-hole", description: "Live scores as someone you follow plays" },
      { type: "notify_round_completed", label: "Round finished", description: "When someone you follow finishes a round" },
    ],
  },
];

export const NOTIFICATION_TYPE_KEYS = NOTIFICATION_SECTIONS.flatMap((s) => s.items.map((i) => i.type));
export const NOTIFICATION_PREF_KEYS = [PUSH_MASTER_KEY, ...NOTIFICATION_TYPE_KEYS];

/**
 * Split recipients into who gets the in-app row vs the device push for a given
 * notification type, honoring prefs (opt-out):
 *   - inApp = users who haven't turned this type off.
 *   - push  = inApp users who also haven't turned master push off.
 * Uncategorized types have no per-type toggle → always in-app; push still
 * respects master. Best-effort: on error, deliver to everyone on both channels.
 */
export async function resolveNotificationRecipients(
  admin: SupabaseClient,
  userIds: string[],
  type: string,
  orgId: string,
): Promise<{ inApp: string[]; push: string[] }> {
  if (userIds.length === 0) return { inApp: [], push: [] };
  try {
    const { data } = await admin
      .from("v2_notification_prefs")
      .select("user_id, category")
      .eq("org_id", orgId)
      .eq("enabled", false)
      .in("category", [type, PUSH_MASTER_KEY])
      .in("user_id", userIds);
    const typeOff = new Set<string>();
    const pushOff = new Set<string>();
    for (const r of data || []) {
      if (r.category === PUSH_MASTER_KEY) pushOff.add(r.user_id as string);
      else typeOff.add(r.user_id as string);
    }
    const inApp = userIds.filter((u) => !typeOff.has(u));
    const push = inApp.filter((u) => !pushOff.has(u));
    return { inApp, push };
  } catch {
    return { inApp: userIds, push: userIds };
  }
}
