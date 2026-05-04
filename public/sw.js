// Service Worker for Golfapalooza Push Notifications
//
// App-icon badge counter: the SW increments a count in IndexedDB on each push
// and decrements it when a notification is clicked. While the app is open, the
// page is the source of truth and pushes the authoritative count via a
// `badge:set` message — see src/lib/notifications/badge.ts.

const BADGE_DB = "golfapalooza-badge";
const BADGE_STORE = "kv";
const BADGE_KEY = "count";

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BADGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BADGE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readBadgeCount() {
  try {
    const db = await openBadgeDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE, "readonly");
      const req = tx.objectStore(BADGE_STORE).get(BADGE_KEY);
      req.onsuccess = () => resolve(Number(req.result) || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

async function writeBadgeCount(count) {
  try {
    const db = await openBadgeDb();
    await new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE, "readwrite");
      tx.objectStore(BADGE_STORE).put(count, BADGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore — badge will fall out of sync but app reload will correct it
  }
}

async function applyBadge(count) {
  try {
    if (count > 0 && navigator.setAppBadge) {
      await navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    }
  } catch {
    // some platforms throw if the app isn't installed — ignore
  }
}

async function bumpBadge(delta) {
  const next = Math.max(0, (await readBadgeCount()) + delta);
  await writeBadgeCount(next);
  await applyBadge(next);
}

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
    (async () => {
      await self.registration.showNotification(title, options);
      await bumpBadge(1);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") {
    event.waitUntil(bumpBadge(-1));
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
    (async () => {
      await bumpBadge(-1);
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })(),
  );
});

// Page → SW: authoritative badge sync while the app is open.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "badge:set") {
    const count = Math.max(0, Math.floor(Number(data.count) || 0));
    event.waitUntil(
      (async () => {
        await writeBadgeCount(count);
        await applyBadge(count);
      })(),
    );
  }
});
