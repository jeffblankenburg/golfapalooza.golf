import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";

// Ensure VAPID is configured in THIS serverless function
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

/**
 * @swagger
 * /api/notifications/test-push:
 *   post:
 *     summary: Send a test push notification to yourself (admin only)
 *     tags: [Notifications, Admin]
 *     responses:
 *       200:
 *         description: Test result with diagnostics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Diagnostics
  const diagnostics: Record<string, unknown> = {};

  // Check VAPID configuration
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const hasVapid = !!(
    vapidPublic &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
  diagnostics.vapidConfigured = hasVapid;
  diagnostics.vapidSubject = process.env.VAPID_SUBJECT || "(not set)";
  // Show first/last few chars of the public key so we can verify it matches client-side
  diagnostics.vapidPublicKeyPrefix = vapidPublic
    ? `${vapidPublic.slice(0, 10)}...${vapidPublic.slice(-10)}`
    : "(not set)";

  if (!hasVapid) {
    return NextResponse.json({
      success: false,
      error: "VAPID keys not configured on server",
      diagnostics,
    });
  }

  // Check push subscriptions for this user
  const admin = createAdminClient();
  const { data: subscriptions, error: subError } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, created_at")
    .eq("user_id", user.id);

  diagnostics.subscriptionCount = subscriptions?.length || 0;
  diagnostics.subscriptions = (subscriptions || []).map((s) => ({
    endpoint: s.endpoint.slice(0, 80) + "...",
    created_at: s.created_at,
  }));

  if (subError) {
    diagnostics.subscriptionError = subError.message;
  }

  if (!subscriptions?.length) {
    return NextResponse.json({
      success: false,
      error:
        "No push subscriptions found for your account. Make sure you've enabled notifications in the app.",
      diagnostics,
    });
  }

  // Send test push
  const payload = JSON.stringify({
    title: "Golfapalooza Test",
    body: "Push notifications are working!",
    data: { url: "/" },
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  const pushResults = results.map((r, i) => {
    if (r.status === "rejected") {
      const reason = r.reason as { statusCode?: number; body?: string; message?: string };
      return {
        endpoint: subscriptions[i].endpoint.slice(0, 80) + "...",
        status: "rejected" as const,
        error: `${reason.statusCode || ""} ${reason.message || ""}`.trim(),
        body: reason.body || undefined,
      };
    }
    return {
      endpoint: subscriptions[i].endpoint.slice(0, 80) + "...",
      status: "fulfilled" as const,
    };
  });

  diagnostics.pushResults = pushResults;

  const anySuccess = results.some((r) => r.status === "fulfilled");

  // Clean up expired subscriptions (410)
  const expiredEndpoints = results
    .map((r, i) =>
      r.status === "rejected" &&
      (r.reason as { statusCode?: number })?.statusCode === 410
        ? subscriptions[i].endpoint
        : null
    )
    .filter(Boolean);

  if (expiredEndpoints.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .in("endpoint", expiredEndpoints as string[]);
    diagnostics.expiredCleaned = expiredEndpoints.length;
  }

  return NextResponse.json({
    success: anySuccess,
    error: anySuccess
      ? undefined
      : "All push deliveries failed — see diagnostics",
    diagnostics,
  });
}
