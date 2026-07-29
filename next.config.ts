import type { NextConfig } from "next";

/** Strips a scheme and surrounding slashes, in case an env var was set to a full URL by mistake. */
function hostnameFromEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  return raw.trim().replace(/^https?:\/\//i, "").replace(/^\/+|\/+$/g, "");
}

const bunnyStreamHostname = hostnameFromEnv("BUNNY_STREAM_CDN_HOSTNAME");
const bunnyStorageHostname = hostnameFromEnv("BUNNY_STORAGE_PULL_ZONE_HOSTNAME");

const nextConfig: NextConfig = {
  images: {
    // Only Bunny-hosted thumbnails go through next/image's optimizer — a
    // series/category cover image is a freeform admin-pasted URL (any host),
    // so those stay `unoptimized` rather than widening this to `**`.
    remotePatterns: [
      ...(bunnyStreamHostname ? [{ protocol: "https" as const, hostname: bunnyStreamHostname }] : []),
      ...(bunnyStorageHostname ? [{ protocol: "https" as const, hostname: bunnyStorageHostname }] : []),
    ],
  },
};

export default nextConfig;
