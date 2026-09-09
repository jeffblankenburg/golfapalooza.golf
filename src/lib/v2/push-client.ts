"use client";

/**
 * v2 push subscription client. Registers the SHARED service worker (/sw.js) and
 * the SHARED VAPID key, but stores the subscription in v2 via /api/v2. Because
 * both apps register the same SW + key, the browser returns the same push
 * subscription — v2 just records it in v2_push_subscriptions.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Request permission (if needed) and register the subscription with v2. */
export async function subscribeToV2Push(): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const existing = subscription.options?.applicationServerKey
        ? new Uint8Array(subscription.options.applicationServerKey)
        : null;
      const keysMatch =
        existing &&
        existing.length === currentKey.length &&
        existing.every((b, i) => b === currentKey[i]);
      if (!keysMatch) {
        const old = subscription.endpoint;
        await subscription.unsubscribe();
        fetch("/api/v2/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: old }),
        }).catch(() => {});
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const res = await fetch("/api/v2/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch (err) {
    console.error("v2 push subscribe failed:", err);
    return false;
  }
}
