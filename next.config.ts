import type { NextConfig } from "next";

// Every <Image> in this app renders `unoptimized`, and `images.unoptimized`
// below says so where it matters. The two are not the same thing: the prop
// changes what a component emits, while the config flag is what removes the
// `/_next/image` route — and that route will fetch and decode any same-origin
// path it is given, uploaded files included, through sharp. Two reasons never
// to want it here. Bunny thumbnail/cover URLs are short-lived signed URLs
// (BUNNY_STREAM_TOKEN_AUTH_KEY), and the optimizer re-fetches them outside the
// request that made them, so a URL that was valid when rendered can 401 by the
// time it is fetched again (`OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED`).
// And an image decoder reachable by URL is attack surface with nothing to
// show for it — GHSA-2xp9-vwfh-vxw4 was exactly that, in AVIF.
const nextConfig: NextConfig = {
  images: { unoptimized: true },

  /**
   * Headers every response carries.
   *
   * Transport security comes from the platform (Vercel adds HSTS itself); the
   * rest has to be said here. SAMEORIGIN rather than DENY because the reader
   * and the players frame this origin's own pages; nobody else may.
   *
   * There is deliberately no script-source CSP yet. The two inline scripts
   * and the inline branding style in src/app/layout.tsx need nonces or
   * hashes before one can be enforced, and the reader and player origins
   * need listing — that is its own change, to be run report-only first.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },

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
