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
const nextConfig: NextConfig = {
  /**
   * Keep Prisma's engines for databases we don't use out of every function.
   *
   * Prisma ships a WASM query engine *and* a WASM query compiler for each
   * database it supports — CockroachDB, MySQL, SQLite, SQL Server and
   * PostgreSQL — as base64 `.js` and `.mjs` pairs, ~45 MB for the four we will
   * never speak. Next's file tracing can't tell which one a running app picks,
   * so it puts all five in *every* serverless function.
   *
   * That is not a rounding error at this app's shape: 305 routes, each an
   * independent function, each carrying its own copy. Measured on a clean
   * build, one API route traced 82.8 MB of which 98% was Prisma and 44.7 MB
   * was these four — about 14 GB per deployment, before Vercel keeps a single
   * previous deployment around.
   *
   * Excluded by name rather than by a glob over `*wasm*`, so the PostgreSQL
   * pair this app actually needs can never be caught by the same rule.
   *
   * This does not reach the proxy: Next applies these excludes to pages and
   * route handlers, not to middleware, so that one function keeps its copy of
   * all five. It is one function rather than 305, so it costs 45 MB — worth
   * knowing about, not worth working around.
   */
  outputFileTracingExcludes: {
    "**/*": [
      "node_modules/@prisma/client/runtime/*mysql*",
      "node_modules/@prisma/client/runtime/*sqlite*",
      "node_modules/@prisma/client/runtime/*sqlserver*",
      "node_modules/@prisma/client/runtime/*cockroachdb*",
      "**/node_modules/@prisma/client/runtime/*mysql*",
      "**/node_modules/@prisma/client/runtime/*sqlite*",
      "**/node_modules/@prisma/client/runtime/*sqlserver*",
      "**/node_modules/@prisma/client/runtime/*cockroachdb*",
    ],
  },
};

export default nextConfig;
