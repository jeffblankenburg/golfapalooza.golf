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

  const urlToOpen = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

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
