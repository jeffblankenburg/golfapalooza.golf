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
  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subError) {
    console.error(`[Push] Failed to fetch subscriptions for user ${userId}:`, subError.message);
    return;
  }

  if (!subscriptions?.length) {
    console.log(`[Push] No subscriptions found for user ${userId}`);
    return;
  }

  console.log(`[Push] Sending to ${subscriptions.length} subscription(s) for user ${userId}`);

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

  // Log results
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      console.error(`[Push] Failed for user ${userId} endpoint ${subscriptions[i].endpoint.slice(0, 60)}...: ${result.reason?.statusCode || result.reason?.message || result.reason}`);
    }
  }

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
    console.log(`[Push] Cleaning up ${expiredEndpoints.length} expired subscription(s) for user ${userId}`);
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
