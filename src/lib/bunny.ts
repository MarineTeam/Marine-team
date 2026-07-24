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

export function bunnyStreamThumbnailUrl(videoId: string): string {
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!cdnHostname) return "";
  return `https://${cdnHostname}/${videoId}/thumbnail.jpg`;
}

export function bunnyStreamEmbedUrl(videoId: string): string {
  return `https://iframe.mediadelivery.net/embed/${streamLibraryId()}/${videoId}?autoplay=false`;
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
