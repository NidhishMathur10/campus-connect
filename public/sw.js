/* CampusConnect service worker: web push + notification clicks. (No offline caching.) */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Chrome only treats a site as installable with a fetch handler on some versions; pass everything through.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CampusConnect", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CampusConnect";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      tag: data.tag || undefined, // same ticket → replaces the earlier notification
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          if ("navigate" in client) await client.navigate(target);
        } catch {
          /* navigation can be refused; focusing is still useful */
        }
        return client.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
