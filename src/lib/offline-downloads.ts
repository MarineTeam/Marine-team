/**
 * The device side of downloads: putting a video file in Cache Storage so it
 * plays with no network, and keeping an index of what's there.
 *
 * Cache Storage rather than IndexedDB because the service worker can answer a
 * `<video src>` straight out of it (see public/sw.js), which is what makes an
 * ordinary player element work offline — a blob in IndexedDB would have to be
 * read fully into memory and turned into an object URL first, which a
 * sermon-length MP4 on a phone can't afford.
 *
 * Everything here is per device and unauthenticated, exactly like the rest of
 * src/lib/device-settings.ts: the server never learns what's been downloaded.
 */

export const DOWNLOAD_CACHE = "marine-team-downloads-v1";
const INDEX_KEY = "marine-downloads-index";

export type DownloadedVideo = {
  videoId: string;
  /** The cache key the file is stored under; also what a <video> element points at. */
  cacheUrl: string;
  title: string;
  seriesTitle: string | null;
  videoSlug: string;
  durationSeconds: number | null;
  bytes: number;
  downloadedAt: string;
};

/** Downloads are keyed by video id on our own origin, so the SW can recognise them by path. */
export function downloadCacheUrl(videoId: string): string {
  return `/offline-video/${videoId}.mp4`;
}

export function readDownloadIndex(): DownloadedVideo[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DownloadedVideo => Boolean(item?.videoId && item?.cacheUrl));
  } catch {
    return [];
  }
}

function writeDownloadIndex(items: DownloadedVideo[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked; the cache entry itself is still usable this session.
  }
  window.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED_EVENT));
}

export const DOWNLOADS_CHANGED_EVENT = "marine-downloads-change";

export function isDownloaded(videoId: string): boolean {
  return readDownloadIndex().some((item) => item.videoId === videoId);
}

/** Whether this browser can hold downloads at all — Cache Storage needs a secure context. */
export function downloadsSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && window.isSecureContext;
}

/** Whether the app is running as an installed PWA, which the download policy can gate on. */
export function currentPlatform(): "web" | "pwa" {
  if (typeof window === "undefined") return "web";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari predates display-mode and uses its own flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "pwa" : "web";
}

/**
 * Whether the device is on a metered connection, for the Wi-Fi-only
 * preference in /profile/settings. The Network Information API is
 * Chromium-only; where it's missing we can't tell, and treating "unknown" as
 * cellular would block downloads on every desktop browser, so it isn't.
 */
export function isLikelyCellular(): boolean {
  const connection = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } })
    .connection;
  if (!connection) return false;
  if (connection.type) return connection.type === "cellular";
  return false;
}

/**
 * Fetches the file and stores it under our own origin's cache key, reporting
 * progress as it goes.
 *
 * Streamed through a reader rather than `cache.add(url)` so there's something
 * to show on a 300MB download; the response is reassembled into a Blob and
 * put into the cache with the headers a `<video>` needs (a Content-Type, and
 * a length so seeking works).
 */
export async function downloadVideo(
  meta: Omit<DownloadedVideo, "bytes" | "downloadedAt" | "cacheUrl">,
  sourceUrl: string,
  onProgress?: (fraction: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<DownloadedVideo> {
  const cacheUrl = downloadCacheUrl(meta.videoId);
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok || !response.body) throw new Error("Couldn't fetch the video file");

  const total = Number(response.headers.get("Content-Length") ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(total ? received / total : 0, received);
  }

  const blob = new Blob(chunks as BlobPart[], { type: response.headers.get("Content-Type") ?? "video/mp4" });
  const cache = await caches.open(DOWNLOAD_CACHE);
  await cache.put(
    cacheUrl,
    new Response(blob, {
      headers: {
        "Content-Type": blob.type,
        "Content-Length": String(blob.size),
        // Lets the player seek within the cached file rather than only
        // playing it straight through.
        "Accept-Ranges": "bytes",
      },
    }),
  );

  const entry: DownloadedVideo = {
    ...meta,
    cacheUrl,
    bytes: blob.size,
    downloadedAt: new Date().toISOString(),
  };
  writeDownloadIndex([entry, ...readDownloadIndex().filter((i) => i.videoId !== meta.videoId)]);
  return entry;
}

export async function removeDownload(videoId: string): Promise<void> {
  try {
    const cache = await caches.open(DOWNLOAD_CACHE);
    await cache.delete(downloadCacheUrl(videoId));
  } catch {
    // Already gone, or storage cleared by the browser — the index entry below
    // is removed either way so the list doesn't show a phantom.
  }
  writeDownloadIndex(readDownloadIndex().filter((item) => item.videoId !== videoId));
}

export async function removeAllDownloads(): Promise<void> {
  try {
    await caches.delete(DOWNLOAD_CACHE);
  } catch {
    // As above.
  }
  writeDownloadIndex([]);
}

/**
 * Drops index entries whose cached file has vanished — browsers evict caches
 * under storage pressure without telling the page, and a list offering
 * playback of a file that isn't there is worse than a shorter list.
 */
export async function reconcileDownloads(): Promise<DownloadedVideo[]> {
  const index = readDownloadIndex();
  if (index.length === 0 || !downloadsSupported()) return index;
  try {
    const cache = await caches.open(DOWNLOAD_CACHE);
    const present = await Promise.all(
      index.map(async (item) => ((await cache.match(item.cacheUrl)) ? item : null)),
    );
    const kept = present.filter((item): item is DownloadedVideo => item !== null);
    if (kept.length !== index.length) writeDownloadIndex(kept);
    return kept;
  } catch {
    return index;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
