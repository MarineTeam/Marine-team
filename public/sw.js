// Minimal service worker: enables PWA installability and Web Push
// notifications. Deliberately does NOT cache pages/API responses — this
// site's content is dynamic and often auth-gated, so an aggressive cache
// would risk showing stale or wrong-audience content offline. It only
// caches its own static shell assets, plus videos the member explicitly
// downloaded (see the /offline-video/ fetch handler below), which are
// deliberate, member-initiated copies rather than opportunistic caching.
const CACHE_NAME = "marine-team-shell-v3";
const SHELL_ASSETS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

// Written by src/lib/offline-downloads.ts; kept out of the activate-time
// cleanup below so a version bump of the shell never wipes someone's
// downloads.
const DOWNLOAD_CACHE = "marine-team-downloads-v1";
const DOWNLOAD_PATH_PREFIX = "/offline-video/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== DOWNLOAD_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Serves downloaded videos from the cache. These URLs are ours by
 * construction (/offline-video/<id>.mp4) and never exist on the server, so
 * this handler is the only thing that can answer them — which is what makes a
 * plain <video src> play with no network at all.
 *
 * Range requests get an explicit slice of the cached blob: a media element
 * seeking in a file expects 206 Partial Content, and Cache Storage always
 * replays the whole 200 response, which several browsers refuse to seek in.
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(DOWNLOAD_PATH_PREFIX)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.open(DOWNLOAD_CACHE).then((cache) => cache.match(url.pathname));
      if (!cached) return new Response("Not downloaded", { status: 404 });

      const range = event.request.headers.get("range");
      if (!range) return cached;

      const blob = await cached.blob();
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : blob.size - 1;

      return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
          "Content-Type": blob.type || "video/mp4",
          "Content-Range": `bytes ${start}-${end}/${blob.size}`,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
        },
      });
    })(),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Marine Team", body: "" };
  try {
    payload = event.data.json();
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
