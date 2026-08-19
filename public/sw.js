// Minimal service worker: enables PWA installability and Web Push
// notifications. Deliberately does NOT cache pages/API responses — this
// site's content is dynamic and often auth-gated, so an aggressive cache
// would risk showing stale or wrong-audience content offline. It only
// caches its own static shell assets, plus videos the member explicitly
// downloaded (see the /offline-video/ fetch handler below), which are
// deliberate, member-initiated copies rather than opportunistic caching.
//
// /offline.html is the one exception to "no pages": it's a static,
// unauthenticated, data-free file (no Next.js build output, no server
// round trip) that reads the same localStorage download index the app
// writes and plays straight out of DOWNLOAD_CACHE. Without it, a failed
// navigation — including the installed PWA's own start_url on a cold
// launch — falls through to the browser's native "you're offline"
// interstitial, which has no way to reach a video already saved to the
// device. See the navigate branch of the fetch handler below.
const CACHE_NAME = "marine-team-shell-v4";
const SHELL_ASSETS = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/offline.html"];

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
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(DOWNLOAD_PATH_PREFIX)) {
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
    return;
  }

  // Page loads (typing the URL, a bookmark, reopening the installed PWA)
  // try the network exactly as they would with no service worker at all —
  // this never serves a stale page. Only when the network is actually
  // unreachable does it fall back to the offline shell, so a member who
  // opens the app with no connection lands on their downloaded videos
  // instead of the OS's own offline error page.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
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
