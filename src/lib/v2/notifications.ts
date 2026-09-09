import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * v2 notification dispatch. Reuses the shared web-push machinery (same VAPID keys
 * + the same /public/sw.js payload shape { title, body, data }) but writes to the
 * v2-owned tables. Producers (chat, gallery, etc.) call these server-side with a
 * service-role client. Best-effort: push failures never throw.
 */

if (
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export interface V2NotificationInput {
  orgId: string;
  type: string;
  title: string;
  body?: string;
  /** data.url is an in-app path the shared service worker navigates to on click. */
  data?: Record<string, unknown>;
}

async function pushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; data: Record<string, unknown> },
): Promise<void> {
  const { data: subs } = await admin
    .from("v2_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      ),
    ),
  );

  // Clean up subscriptions the browser has dropped (410 Gone).
  const gone = results
    .map((r, i) =>
      r.status === "rejected" &&
      (r.reason as { statusCode?: number })?.statusCode === 410
        ? subs[i].endpoint
        : null,
    )
    .filter(Boolean) as string[];
  if (gone.length) {
    await admin
      .from("v2_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", gone);
  }
}

/** Notify many users at once: insert rows + push. */
export async function sendV2Notifications(
  admin: SupabaseClient,
  userIds: string[],
  input: V2NotificationInput,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;

  await admin.from("v2_notifications").insert(
    ids.map((user_id) => ({
      org_id: input.orgId,
      user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? {},
    })),
  );

  const payload = {
    title: input.title,
    body: input.body ?? "",
    data: input.data ?? {},
  };
  await Promise.allSettled(ids.map((id) => pushToUser(admin, id, payload)));
}

/** Notify a single user. */
export async function sendV2Notification(
  admin: SupabaseClient,
  userId: string,
  input: V2NotificationInput,
): Promise<void> {
  await sendV2Notifications(admin, [userId], input);
}
