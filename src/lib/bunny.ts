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

export type BunnyStreamVideo = {
  guid: string;
  status: number;
  length?: number;
  thumbnailFileName?: string | null;
};

/** Fetches a single video's current state from Bunny (status, duration, thumbnail file name). */
export async function bunnyGetStreamVideo(videoId: string): Promise<BunnyStreamVideo> {
  const res = await fetch(`${STREAM_API_BASE}/library/${streamLibraryId()}/videos/${videoId}`, {
    headers: { AccessKey: streamApiKey() },
  });
  if (!res.ok) {
    throw new Error(`Bunny Stream get video failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as BunnyStreamVideo;
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
