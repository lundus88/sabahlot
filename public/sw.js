self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch(async () => {
        const cache = await caches.open("sabahlot-offline-map-lite-v1");
        const cached = await cache.match(event.request);

        if (cached) {
          return cached;
        }

        return new Response(
          "Map tile not available offline. Prepare this area while online.",
          {
            status: 503,
            statusText: "Offline tile unavailable",
            headers: {
              "Content-Type": "text/plain",
            },
          },
        );
      }),
  );
});
