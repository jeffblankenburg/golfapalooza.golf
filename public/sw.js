// Service Worker for Golfapalooza Push Notifications

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Golfapalooza", body: event.data.text() };
  }

  const title = payload.title || "Golfapalooza";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: "golfapalooza-notification",
    renotify: true,
    vibrate: [100, 50, 100],
    data: payload.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Update PWA app icon badge
      if (navigator.setAppBadge) {
        navigator.setAppBadge();
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear PWA app icon badge
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge();
  }

  if (event.action === "dismiss") {
    return;
  }

  const targetPath = event.notification.data?.url || "/";
  const urlToOpen = new URL(targetPath, self.location.origin).href;

  // Log notification click (fire-and-forget)
  fetch(new URL("/api/activity", self.location.origin).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "notification_click",
      page_path: targetPath,
      metadata: {
        notification_title: event.notification.title || null,
        notification_tag: event.notification.tag || null,
      },
    }),
  }).catch(() => {});

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
