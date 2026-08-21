import crypto from "node:crypto";

const STREAM_API_BASE = "https://video.bunnycdn.com";

function streamLibraryId(): string {
  const id = process.env.BUNNY_STREAM_LIBRARY_ID;
  if (!id) throw new Error("Missing BUNNY_STREAM_LIBRARY_ID env var");
  return id;
}

function streamApiKey(): string {
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!key) throw new Error("Missing BUNNY_STREAM_API_KEY env var");
  return key;
}

function storageZone(): string {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  if (!zone) throw new Error("Missing BUNNY_STORAGE_ZONE env var");
  return zone;
}

function storageApiKey(): string {
  const key = process.env.BUNNY_STORAGE_API_KEY;
  if (!key) throw new Error("Missing BUNNY_STORAGE_API_KEY env var");
  return key;
}

function storageHost(): string {
  const region = process.env.BUNNY_STORAGE_REGION?.trim();
  return region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
}

/**
 * The second, deliberately public storage zone — the only place a file is
 * ever reachable without a session. Podcast enclosures live here and
 * nothing else does.
 *
 * A separate *storage* zone rather than an edge rule on the private one is
 * the point: a private file simply isn't in this zone, so there is no path
 * to guess and no rule that can be silently removed later. The invariant is
 * "present in this zone == meant to be public", which is checkable by
 * looking rather than by trusting configuration.
 *
 * Returns null when unconfigured, which is the default — the podcast feed
 * then serves through the app's own gated route instead.
 */
function publicStorageConfig(): { zone: string; apiKey: string; host: string } | null {
  const zone = process.env.BUNNY_PUBLIC_STORAGE_ZONE?.trim();
  const apiKey = process.env.BUNNY_PUBLIC_STORAGE_API_KEY?.trim();
  if (!zone || !apiKey) return null;
  const region = process.env.BUNNY_PUBLIC_STORAGE_REGION?.trim();
  return { zone, apiKey, host: region ? `${region}.storage.bunnycdn.com` : "storage.bunnycdn.com" };
}

/**
 * Whether public mirroring is available at all. Both the storage zone (to
 * write to) and its pull zone hostname (to serve from) are needed — a
 * half-configured setup would copy files somewhere nothing can read them.
 */
export function bunnyPublicStorageConfigured(): boolean {
  return publicStorageConfig() !== null && Boolean(process.env.BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME?.trim());
}

/**
 * Streams an object from the private storage zone into the public one.
 *
 * Streamed rather than buffered: a sermon recording is routinely tens or
 * hundreds of megabytes, and holding one in a serverless function's memory
 * is how this falls over. Note that it still has to pass through the
 * function, so a large enough file can exhaust the request timeout — the
 * copy is reported as failed in that case and the file is simply left
 * unmirrored, never recorded as published.
 */
export async function bunnyPublicStorageCopyFrom(sourceUrl: string, path: string, contentType?: string): Promise<void> {
  const config = publicStorageConfig();
  if (!config) throw new Error("Public storage zone is not configured");

  const source = await fetch(sourceUrl, { cache: "no-store" });
  if (!source.ok || !source.body) {
    throw new Error(`Could not read the source file (${source.status})`);
  }

  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`https://${config.host}/${config.zone}/${cleanPath}`, {
    method: "PUT",
    headers: {
      AccessKey: config.apiKey,
      "Content-Type": contentType ?? source.headers.get("content-type") ?? "application/octet-stream",
    },
    body: source.body,
    // Required by undici to send a streaming request body; without it the
    // fetch throws before a byte moves.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!res.ok) {
    throw new Error(`Bunny public storage upload failed: ${res.status} ${await res.text()}`);
  }
}

/** Removes an object from the public zone. A 404 counts as success — the goal is "not public any more". */
export async function bunnyPublicStorageDelete(path: string): Promise<void> {
  const config = publicStorageConfig();
  if (!config) throw new Error("Public storage zone is not configured");

  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`https://${config.host}/${config.zone}/${cleanPath}`, {
    method: "DELETE",
    headers: { AccessKey: config.apiKey },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny public storage delete failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * CDN hostname env vars are documented as a bare hostname (e.g.
 * "xxxxxxxx.b-cdn.net"), but it's an easy mistake to paste the full URL
 * copied from the Bunny dashboard instead — this strips any protocol
 * prefix and trailing/leading slashes so either form works.
 */
function normalizeHostname(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+|\/+$/g, "");
}

export type BunnyStreamVideoSummary = {
  guid: string;
  title: string;
  status: number;
  length: number;
  dateUploaded: string;
};

/** Lists every video in the Bunny Stream library, paging through the API's 100-per-page limit. */
export async function bunnyListStreamVideos(): Promise<BunnyStreamVideoSummary[]> {
  const libraryId = streamLibraryId();
  const results: BunnyStreamVideoSummary[] = [];
  let page = 1;
  const itemsPerPage = 100;

  while (true) {
    const res = await fetch(
      `${STREAM_API_BASE}/library/${libraryId}/videos?page=${page}&itemsPerPage=${itemsPerPage}&orderBy=date`,
      { headers: { AccessKey: streamApiKey() } },
    );
    if (!res.ok) {
      throw new Error(`Bunny Stream list videos failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      items: BunnyStreamVideoSummary[];
      totalItems: number;
    };
    results.push(...data.items);
    if (results.length >= data.totalItems || data.items.length === 0) break;
    page += 1;
  }

  return results;
}

/** Creates a placeholder video entry in Bunny Stream; returns its guid. */
export async function bunnyCreateStreamVideo(title: string): Promise<string> {
  const res = await fetch(`${STREAM_API_BASE}/library/${streamLibraryId()}/videos`, {
    method: "POST",
    headers: {
      AccessKey: streamApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`Bunny Stream create video failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { guid: string };
  return data.guid;
}

export async function bunnyDeleteStreamVideo(videoId: string): Promise<void> {
  const res = await fetch(
    `${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}`,
    { method: "DELETE", headers: { AccessKey: streamApiKey() } },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny Stream delete video failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Presigned TUS upload credentials for direct browser -> Bunny Stream
 * uploads, so large video files never pass through our server.
 * See https://docs.bunny.net/docs/stream-uploading#tus-resumable-uploads
 */
export function bunnyStreamTusSignature(videoId: string) {
  const libraryId = streamLibraryId();
  const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  const signature = crypto
    .createHash("sha256")
    .update(`${libraryId}${streamApiKey()}${expirationTime}${videoId}`)
    .digest("hex");

  return {
    endpoint: "https://video.bunnycdn.com/tusupload",
    libraryId,
    videoId,
    expirationTime,
    signature,
  };
}

/** Maps Bunny Stream's numeric status to our VideoStatus enum. 4 = finished, 5 = error. */
export function mapBunnyStreamStatus(bunnyStatus: number): "PROCESSING" | "READY" | "FAILED" {
  if (bunnyStatus < 4) return "PROCESSING";
  return bunnyStatus === 4 ? "READY" : "FAILED";
}

/**
 * BunnyCDN's general Pull Zone Token Authentication: keyed on the URL path
 * (not a video id), base64url-encoded.
 * base64url(sha256(tokenAuthKey + urlPath + expires)).
 * https://docs.bunny.net/docs/cdn-token-authentication
 */
function pullZoneAuthParams(tokenAuthKey: string, urlPath: string, ttlSeconds: number): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = crypto
    .createHash("sha256")
    .update(`${tokenAuthKey}${urlPath}${expires}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `token=${token}&expires=${expires}`;
}

/**
 * When the Stream library has "Token Authentication" enabled (Library ->
 * Security), the *embed player* URL 404s without a signed `token`/`expires`
 * pair — but this is a distinct mechanism from the thumbnail/CDN one below.
 * https://docs.bunny.net/docs/stream-embed-view-token-authentication
 * Formula: sha256_hex(tokenAuthKey + videoId + expires).
 */
function bunnyStreamEmbedAuthParams(videoId: string): string {
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  if (!tokenAuthKey) return "";

  const expires = Math.floor(Date.now() / 1000) + 6 * 60 * 60; // 6 hours
  const token = crypto
    .createHash("sha256")
    .update(`${tokenAuthKey}${videoId}${expires}`)
    .digest("hex");
  return `token=${token}&expires=${expires}`;
}

/**
 * Overrides Bunny Stream's auto-generated thumbnail with an image fetched
 * from `thumbnailUrl` (which can itself be a Bunny Storage URL, letting
 * "manually uploaded" reuse the same call as "set from URL" — the file just
 * goes to Bunny Storage first).
 */
export async function bunnySetStreamThumbnail(videoId: string, thumbnailUrl: string): Promise<void> {
  const res = await fetch(
    `${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}/thumbnail?thumbnailUrl=${encodeURIComponent(thumbnailUrl)}`,
    { method: "POST", headers: { AccessKey: streamApiKey() } },
  );
  if (!res.ok) {
    throw new Error(`Bunny Stream set thumbnail failed: ${res.status} ${await res.text()}`);
  }
}

export type BunnyStreamCaption = { srclang: string; label: string | null };

export type BunnyStreamVideo = {
  guid: string;
  status: number;
  length?: number;
  thumbnailFileName?: string | null;
  captions?: BunnyStreamCaption[] | null;
  /**
   * Whether Bunny actually generated MP4 fallback files *for this video*.
   *
   * This is per-video, not per-library: turning MP4 Fallback on in the
   * library's encoding settings only affects uploads made afterwards, so a
   * library with the setting enabled can still be full of older videos
   * reporting false. That distinction is the whole reason the downloads code
   * asks Bunny instead of assuming.
   */
  hasMP4Fallback?: boolean;
  /** Comma-separated, e.g. "240p,360p,480p,720p". Absent while encoding. */
  availableResolutions?: string | null;
};

/** Fetches a single video's current state from Bunny (status, duration, thumbnail file name, captions). */
export async function bunnyGetStreamVideo(videoId: string): Promise<BunnyStreamVideo> {
  const res = await fetch(`${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}`, {
    headers: { AccessKey: streamApiKey() },
  });
  if (!res.ok) {
    throw new Error(`Bunny Stream get video failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as BunnyStreamVideo;
}

/**
 * Adds (or replaces) a caption track, identified by `srclang`. Bunny stores
 * the caption itself and bakes a CC toggle into its own embed player once
 * one exists — nothing on our side needs to render or serve the file.
 * `captionsFile` is the raw .vtt/.srt content; Bunny's API wants it base64.
 */
export async function bunnyAddCaption(
  videoId: string,
  srclang: string,
  label: string,
  captionsFile: string,
): Promise<void> {
  const res = await fetch(
    `${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}/captions/${encodeURIComponent(srclang)}`,
    {
      method: "POST",
      headers: { AccessKey: streamApiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        srclang,
        label,
        captionsFile: Buffer.from(captionsFile, "utf-8").toString("base64"),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Bunny Stream add caption failed: ${res.status} ${await res.text()}`);
  }
}

/** Removes a caption track by its srclang. */
export async function bunnyDeleteCaption(videoId: string, srclang: string): Promise<void> {
  const res = await fetch(
    `${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}/captions/${encodeURIComponent(srclang)}`,
    { method: "DELETE", headers: { AccessKey: streamApiKey() } },
  );
  if (!res.ok) {
    throw new Error(`Bunny Stream delete caption failed: ${res.status} ${await res.text()}`);
  }
}

/** Bunny's file name for an auto-generated thumbnail; custom ones get their own name. */
const DEFAULT_THUMBNAIL_FILE_NAME = "thumbnail.jpg";

/**
 * The thumbnail is a plain file served off the Stream library's own CDN
 * pull zone (BUNNY_STREAM_CDN_HOSTNAME) — a different mechanism from the
 * embed player below, even though both live under "Token Authentication" in
 * the Bunny dashboard. This uses the general CDN pull zone scheme (path +
 * expires, base64), not the embed-specific one (video id + expires, hex).
 *
 * `fileName` must be the video's own `thumbnailFileName` from Bunny: only
 * auto-generated thumbnails are literally "thumbnail.jpg", so hardcoding
 * that name 403s for any video whose thumbnail was set or regenerated.
 */
export function bunnyStreamThumbnailUrl(videoId: string, fileName?: string | null): string {
  const rawHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!rawHostname) return "";
  const cdnHostname = normalizeHostname(rawHostname);
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  const path = `/${videoId}/${fileName || DEFAULT_THUMBNAIL_FILE_NAME}`;
  const authParams = tokenAuthKey ? pullZoneAuthParams(tokenAuthKey, path, 6 * 60 * 60) : "";
  return `https://${cdnHostname}${path}${authParams ? `?${authParams}` : ""}`;
}

/** Heights Bunny Stream can produce an MP4 fallback for, best first. */
const MP4_HEIGHTS = [1080, 720, 480, 360, 240] as const;

export type Mp4Height = (typeof MP4_HEIGHTS)[number];

/**
 * Turns Bunny's `availableResolutions` string into heights we can pick from,
 * highest first.
 *
 * Sorted here rather than trusting Bunny's ordering, because selectMp4Height
 * takes the first acceptable entry and would silently hand out 240p if the
 * API ever returned ascending order. Unknown entries (a rendition we have no
 * MP4 constant for) are dropped rather than guessed at.
 */
export function parseBunnyResolutions(raw: string | null | undefined): Mp4Height[] {
  if (!raw) return [];
  const heights = raw
    .split(",")
    .map((part) => Number(part.trim().replace(/p$/i, "")))
    .filter((height): height is Mp4Height => MP4_HEIGHTS.includes(height as Mp4Height));
  return [...new Set(heights)].sort((a, b) => b - a);
}

/**
 * The best rendition Bunny actually has for a video, capped at the site's
 * configured maximum — or null when Bunny has nothing at or below the cap.
 *
 * Never returns a height Bunny didn't report: a 480p source has no
 * play_720p.mp4 for Bunny to serve, and asking for one is what produced the
 * misleading "no downloadable file" this replaced.
 */
export function selectMp4Height(availableResolutions: string | null | undefined): Mp4Height | null {
  const maximum = downloadHeight();
  return parseBunnyResolutions(availableResolutions).find((height) => height <= maximum) ?? null;
}

/**
 * A signed, time-limited URL for one of the video's MP4 fallback renditions,
 * used by the Downloads plugin — the one place a real file (rather than the
 * iframe embed) has to reach the member's device, since HLS segments can't be
 * handed to a `<video>` for offline playback.
 *
 * `height` is required and is expected to come from selectMp4Height, i.e. from
 * what Bunny reported for this video. There is deliberately no default: the
 * previous version defaulted to 720p, which meant every video without that
 * exact rendition looked to the app like a video with no downloads at all.
 *
 * Served off the same library pull zone as the thumbnail, so it uses the same
 * general CDN token scheme (path + expires) rather than the embed-specific
 * one. The TTL is short: the URL is fetched and stored by the browser
 * immediately, and shouldn't stay valid as a shareable direct link.
 */
export function bunnyStreamMp4Url(videoId: string, height: Mp4Height): string {
  const rawHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!rawHostname) throw new Error("BUNNY_STREAM_CDN_HOSTNAME is not set");
  const cdnHostname = normalizeHostname(rawHostname);
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  const path = `/${videoId}/play_${height}p.mp4`;
  const authParams = tokenAuthKey ? pullZoneAuthParams(tokenAuthKey, path, 30 * 60) : "";
  return `https://${cdnHostname}${path}${authParams ? `?${authParams}` : ""}`;
}

/**
 * The ceiling on download quality. 720p by default: a sermon-length video at
 * 1080p is a big ask of a phone's storage and of a church's bandwidth bill.
 *
 * A cap, not a demand — a video Bunny only has at 480p downloads at 480p.
 */
export function downloadHeight(): Mp4Height {
  const configured = Number(process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT);
  return MP4_HEIGHTS.includes(configured as Mp4Height) ? (configured as Mp4Height) : 720;
}

/** What a diagnostic fetch of an MP4 URL told us. Never the reason a download is offered or withheld. */
export type Mp4ProbeResult = "ok" | "forbidden" | "missing" | "error";

/**
 * Checks an MP4 URL and classifies the answer, so a member gets told which
 * thing went wrong.
 *
 * Diagnostic only, by design. Bunny's API is the authority on whether a
 * download exists; this call can fail for reasons that have nothing to do
 * with the file — token auth misconfigured, a CDN edge rejecting HEAD, a
 * blocked referrer — and the old code treated every one of those as "this
 * video has no downloadable file". A `forbidden` here means the file is very
 * likely there and the pull zone's security settings are wrong, which is a
 * completely different fix from re-uploading the video.
 *
 * Uses a 1-byte ranged GET rather than HEAD: some CDN configurations answer
 * HEAD differently from the GET the browser will actually make, and a Range
 * request costs no more than a HEAD while exercising the same path the
 * download will take.
 */
export async function probeBunnyMp4(url: string): Promise<Mp4ProbeResult> {
  if (!url) return "error";
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    if (res.ok || res.status === 206) return "ok";
    if (res.status === 401 || res.status === 403) return "forbidden";
    if (res.status === 404 || res.status === 410) return "missing";
    return "error";
  } catch {
    return "error";
  }
}

export function bunnyStreamEmbedUrl(videoId: string, startSeconds?: number): string {
  const authParams = bunnyStreamEmbedAuthParams(videoId);
  const startParam = startSeconds && startSeconds > 0 ? `t=${Math.floor(startSeconds)}s` : "";
  const query = ["autoplay=false", authParams, startParam].filter(Boolean).join("&");
  return `https://iframe.mediadelivery.net/embed/${streamLibraryId()}/${videoId}?${query}`;
}

/** Uploads a file buffer to Bunny Storage at the given path and returns its public CDN url. */
export async function bunnyStorageUpload(
  path: string,
  body: Buffer,
  contentType?: string,
): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`https://${storageHost()}/${storageZone()}/${cleanPath}`, {
    method: "PUT",
    headers: {
      AccessKey: storageApiKey(),
      "Content-Type": contentType ?? "application/octet-stream",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new Error(`Bunny Storage upload failed: ${res.status} ${await res.text()}`);
  }
  return bunnyStoragePublicUrl(cleanPath);
}

export async function bunnyStorageDelete(path: string): Promise<void> {
  const cleanPath = path.replace(/^\/+/, "");
  const res = await fetch(`https://${storageHost()}/${storageZone()}/${cleanPath}`, {
    method: "DELETE",
    headers: { AccessKey: storageApiKey() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny Storage delete failed: ${res.status} ${await res.text()}`);
  }
}

export type BunnyStorageObject = {
  /** Path within the zone ("files/abc-Song.pdf") — exactly what FileAsset.bunnyPath stores. */
  path: string;
  name: string;
  sizeBytes: number;
  contentType: string | null;
  lastChanged: string | null;
};

type BunnyStorageListItem = {
  ObjectName: string;
  Path: string;
  Length: number;
  IsDirectory: boolean;
  ContentType: string;
  LastChanged: string | null;
};

/**
 * Content type for a storage object Bunny reports no type for, which it
 * routinely does for files uploaded through its own dashboard. Guessed from
 * the extension and deliberately narrow: only types this app actually
 * branches on (readers, audio players, images) are worth naming, and
 * anything else is better left null than labelled wrongly.
 */
function guessContentType(name: string): string | null {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return types[extension] ?? null;
}

/** How deep to walk, and how many objects to gather, before giving up — a guard against a pathologically large zone, not an expected limit. */
const STORAGE_LIST_MAX_DEPTH = 4;
const STORAGE_LIST_MAX_OBJECTS = 2000;

/**
 * Every file in the private storage zone, walking subdirectories.
 *
 * This is what makes files uploaded straight to Bunny (bypassing the app's
 * own 4MB serverless upload limit) adoptable: the objects are already
 * there, they just have no FileAsset row pointing at them.
 */
export async function bunnyListStorageFiles(): Promise<BunnyStorageObject[]> {
  const zone = storageZone();
  const key = storageApiKey();
  const host = storageHost();

  async function listDirectory(prefix: string): Promise<BunnyStorageListItem[]> {
    const clean = prefix ? `${prefix.replace(/^\/+|\/+$/g, "")}/` : "";
    const res = await fetch(`https://${host}/${zone}/${clean}`, {
      headers: { AccessKey: key },
      // Per-request and admin-facing; a cached listing would hide a file
      // someone just uploaded, which is the whole point of looking.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Bunny Storage list failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  const objects: BunnyStorageObject[] = [];
  // Iterative rather than recursive so the object cap can stop the walk
  // partway through a deep tree instead of only between levels.
  const queue: { prefix: string; depth: number }[] = [{ prefix: "", depth: 0 }];

  while (queue.length > 0 && objects.length < STORAGE_LIST_MAX_OBJECTS) {
    const { prefix, depth } = queue.shift()!;
    for (const item of await listDirectory(prefix)) {
      if (item.IsDirectory) {
        if (depth < STORAGE_LIST_MAX_DEPTH) {
          queue.push({ prefix: `${prefix ? `${prefix}/` : ""}${item.ObjectName}`, depth: depth + 1 });
        }
        continue;
      }
      if (objects.length >= STORAGE_LIST_MAX_OBJECTS) break;
      objects.push({
        path: `${prefix ? `${prefix}/` : ""}${item.ObjectName}`,
        name: item.ObjectName,
        sizeBytes: item.Length,
        contentType: item.ContentType?.trim() || guessContentType(item.ObjectName),
        lastChanged: item.LastChanged,
      });
    }
  }

  return objects;
}

/**
 * The stable, unsigned public URL for a Storage file. This is stored
 * long-term (FileAsset.url) and embedded in the podcast RSS feed's
 * <guid>/<enclosure>, both of which need to stay valid indefinitely — so
 * this deliberately never appends a token, even if one is configured.
 * If the pull zone requires a token for direct access, use
 * bunnyStorageSignedUrl() instead, at the point something is actually
 * fetching the file right now.
 */
export function bunnyStoragePublicUrl(path: string): string {
  const rawHost = process.env.BUNNY_STORAGE_PULL_ZONE_HOSTNAME;
  if (!rawHost) throw new Error("Missing BUNNY_STORAGE_PULL_ZONE_HOSTNAME env var");
  const pullZoneHost = normalizeHostname(rawHost);
  return `https://${pullZoneHost}/${path.replace(/^\/+/, "")}`;
}

/**
 * A URL on a *second*, deliberately unauthenticated pull zone, for the one
 * case that genuinely can't use an authenticated one: podcast enclosures.
 * Podcast apps don't carry a session, and an enclosure URL has to keep
 * working for years.
 *
 * Returns null when `BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME` is unset,
 * which is the default — the podcast feed then serves audio through the
 * app's own gated route instead. That default is the safe one, so opting
 * into CDN bandwidth is an explicit decision.
 *
 * **This zone must be restricted to the audio it's meant to serve.** It has
 * no token check, so if it's pointed at the same storage zone with no edge
 * rule, it re-opens every file the main zone was just locked down — the
 * exact hole this whole change closes. Restrict it in Bunny (Pull Zone ->
 * Edge Rules) to the path prefix holding podcast audio, or give it its own
 * storage zone. Nothing in this codebase can check that for you.
 *
 * Note the asymmetry with the app route: a URL on this zone can't be
 * revoked. Flip a series to members-only and the app route stops serving it
 * immediately, while a CDN URL someone already has keeps working until the
 * file is moved or deleted.
 */
export function bunnyStoragePublicPullZoneUrl(path: string): string | null {
  const rawHost = process.env.BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME;
  if (!rawHost) return null;
  return `https://${normalizeHostname(rawHost)}/${path.replace(/^\/+/, "")}`;
}

/**
 * A time-limited, signed variant of bunnyStoragePublicUrl(), for the one
 * case where something needs to fetch a Storage file *right now* rather than
 * store the link: handing a freshly-uploaded thumbnail image to Bunny
 * Stream's "set thumbnail" call, which fetches it immediately. If the
 * Storage pull zone has "Token Authentication" enabled (Pull Zone ->
 * Security), an unsigned URL 401s; this appends the same general BunnyCDN
 * Pull Zone token used by bunnyStreamThumbnailUrl (see pullZoneAuthParams),
 * distinct from the embed player's video-id-keyed scheme.
 *
 * Never use this for anything stored or distributed (DB fields, RSS feeds,
 * public links) — the token expires in minutes and isn't meant to survive
 * past the immediate fetch it's generated for.
 */
export function bunnyStorageSignedUrl(path: string): string {
  const tokenAuthKey = process.env.BUNNY_STORAGE_TOKEN_AUTH_KEY;
  const cleanPath = path.replace(/^\/+/, "");
  const publicUrl = bunnyStoragePublicUrl(cleanPath);
  if (!tokenAuthKey) return publicUrl;

  // 10 minutes — only needs to survive one immediate fetch, not stored anywhere.
  const authParams = pullZoneAuthParams(tokenAuthKey, `/${cleanPath}`, 10 * 60);
  return `${publicUrl}?${authParams}`;
}
