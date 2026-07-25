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
 * When the Stream library has "Token Authentication" enabled (Library ->
 * Security), the embed player and thumbnail/direct-play URLs 404 without a
 * signed `token`/`expires` pair. Bunny's formula:
 * sha256_hex(tokenAuthKey + videoId + expires).
 * https://docs.bunny.net/docs/stream-embed-view-token-authentication
 */
function bunnyStreamAuthParams(videoId: string): string {
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  if (!tokenAuthKey) return "";

  const expires = Math.floor(Date.now() / 1000) + 6 * 60 * 60; // 6 hours
  const token = crypto
    .createHash("sha256")
    .update(`${tokenAuthKey}${videoId}${expires}`)
    .digest("hex");
  return `token=${token}&expires=${expires}`;
}

export function bunnyStreamThumbnailUrl(videoId: string): string {
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!cdnHostname) return "";
  const authParams = bunnyStreamAuthParams(videoId);
  return `https://${cdnHostname}/${videoId}/thumbnail.jpg${authParams ? `?${authParams}` : ""}`;
}

export function bunnyStreamEmbedUrl(videoId: string, startSeconds?: number): string {
  const authParams = bunnyStreamAuthParams(videoId);
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

export function bunnyStoragePublicUrl(path: string): string {
  const pullZoneHost = process.env.BUNNY_STORAGE_PULL_ZONE_HOSTNAME;
  if (!pullZoneHost) throw new Error("Missing BUNNY_STORAGE_PULL_ZONE_HOSTNAME env var");
  return `https://${pullZoneHost}/${path.replace(/^\/+/, "")}`;
}
