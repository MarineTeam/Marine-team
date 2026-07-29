import type { NextConfig } from "next";

// No remote image optimization is configured: every <Image> in this app
// renders `unoptimized`. Bunny thumbnail/cover URLs are frequently
// short-lived signed URLs (BUNNY_STREAM_TOKEN_AUTH_KEY), and Next's image
// optimizer re-fetches the origin URL server-side outside the request that
// generated it (cache misses/revalidation) — a signed URL that was valid
// when rendered can 401/403 by the time the optimizer re-fetches it,
// surfacing as a broken image (`OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED`).
// Series/category cover images are also freeform admin-pasted URLs (any
// host), which `remotePatterns` can't cover without allowing `**` anyway.
const nextConfig: NextConfig = {};

export default nextConfig;
