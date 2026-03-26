import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

if (
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface NotificationPayload {
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

async function sendPushToUser(userId: string, payload: NotificationPayload) {
  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subscriptions?.length) return;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body || "",
    data: payload.data || {},
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload
      )
    )
  );

  // Clean up expired subscriptions
  const expiredEndpoints = results
    .map((result, i) => {
      if (result.status === "rejected" && result.reason?.statusCode === 410) {
        return subscriptions[i].endpoint;
      }
      return null;
    })
    .filter(Boolean);

  if (expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", expiredEndpoints as string[]);
  }
}

export async function sendNotification(
  userId: string,
  payload: NotificationPayload
) {
  const supabase = createAdminClient();

  // Insert into DB
  await supabase.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  });

  // Send push notification
  await sendPushToUser(userId, payload).catch(console.error);
}

export async function sendBulkNotifications(
  userIds: string[],
  payload: NotificationPayload
) {
  const supabase = createAdminClient();

  // Bulk insert into DB
  await supabase.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }))
  );

  // Send push to all users
  await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
  );
}

export async function sendAnnouncement(payload: Omit<NotificationPayload, "type">) {
  const supabase = createAdminClient();

  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("is_active", true);

  if (!users?.length) return;

  const userIds = users.map((u) => u.id);
  await sendBulkNotifications(userIds, { ...payload, type: "announcement" });
}
