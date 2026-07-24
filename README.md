# Media Library

A Subsplash-style media library: Auth0 login, an admin CMS for managing
series/categories/videos/files, video hosted on Bunny Stream, and downloadable
files hosted on Bunny Storage.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- `@auth0/nextjs-auth0` for login/session (Regular Web Application flow)
- Bunny Stream (video) + Bunny Storage (files), uploaded directly from the
  browser via TUS so large files never pass through the app server

## Setup

1. Copy `.env.example` to `.env` and fill in real values:
   - A Postgres connection string (`DATABASE_URL`)
   - An Auth0 "Regular Web Application" (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
     `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` — generate with `openssl rand -hex 32`)
     - In the Auth0 app settings, set Allowed Callback URLs to
       `http://localhost:3000/auth/callback` and Allowed Logout URLs to
       `http://localhost:3000`
   - `ADMIN_EMAILS`: comma-separated emails granted the `ADMIN` role on login
   - A Bunny Stream video library (`BUNNY_STREAM_*`) and a Bunny Storage zone
     with a public pull zone (`BUNNY_STORAGE_*`)
     - If the Stream library has **Token Authentication** enabled (Library ->
       Security in the Bunny dashboard), also set
       `BUNNY_STREAM_TOKEN_AUTH_KEY` to the "Token Authentication Key" shown
       there (a different secret from `BUNNY_STREAM_API_KEY`) — otherwise
       the video player and thumbnails will 404. Leave it unset if token
       auth is off.
2. Install dependencies and generate the Prisma client:
   ```bash
   npm install
   ```
3. Push the schema to your database:
   ```bash
   npm run db:migrate
   ```
4. (Optional) Seed demo content into your local `DATABASE_URL` — categories,
   hymnal series with playable audio, sermon series with demo videos, and a
   members-only series — so there's something to browse without wiring up
   Bunny or Auth0 first:
   ```bash
   npm run db:seed
   ```
   This uses only local files under `public/demo/` (self-generated WAV audio
   tracks and SVG cover images, no external network calls), so it works
   fully offline. Demo videos (`bunnyLibraryId: "demo"`) render a static
   placeholder instead of a real Bunny Stream player, since there's no real
   video behind them — everything else (browsing, categories, hymnal audio
   playback, member-only gating) works exactly as it would with real
   content. Re-run `prisma migrate reset` (or drop and recreate the
   database) before seeding again to avoid unique-slug conflicts.

   For a **live demo running alongside your real production site**, see
   "Demo section (`/demo`)" below instead — it uses a completely separate
   database so simulated content never touches your real data.
5. Start the dev server:
   ```bash
   npm run dev
   ```

## How it works

- **Public site** (`/`, `/series/[slug]`, `/videos/[slug]`): browse published
  categories/series, watch videos (embedded Bunny Stream player), download
  files. Content flagged `memberOnly` requires login.
- **Auth**: `/auth/login`, `/auth/logout`, `/auth/callback` are handled
  automatically by the Auth0 SDK's `proxy.ts` (Next.js 16 renamed Middleware
  to Proxy). Logging in with Auth0 only proves identity — it does **not**
  grant access by itself. Every login attempt gets a `User` row (so it's
  visible at `/admin/users`), but `getCurrentUser()` only treats someone as
  logged in once their row's `authorized` flag is true. Emails in
  `ADMIN_EMAILS` self-authorize as `ADMIN` on first login (so you always
  have a way in); everyone else shows up under "Pending login attempts" at
  `/admin/users` until an admin clicks **Grant access** — or you can
  pre-authorize an email there before they ever log in. Someone who isn't
  authorized yet sees "Access not authorized" in the Navbar instead of
  being treated as a member.
- **Admin CMS** (`/admin`, gated to `ADMIN` role): manage categories, series,
  videos, and files. Video upload creates a placeholder in Bunny Stream,
  signs a TUS upload session, and streams the file straight from the
  browser to Bunny; small files (≤4.5MB) are uploaded to Bunny Storage via
  the server.
- **Bunny Stream playback**: `bunnyStreamEmbedUrl()` and
  `bunnyStreamThumbnailUrl()` (`src/lib/bunny.ts`) build the iframe/thumbnail
  URLs fresh on every request. If `BUNNY_STREAM_TOKEN_AUTH_KEY` is set, they
  sign a short-lived `token`/`expires` pair per Bunny's token authentication
  formula (`sha256_hex(tokenAuthKey + videoId + expires)`); if it's unset,
  plain unsigned URLs are used instead.

## Demo section (`/demo`)

`/demo`, `/demo/series/[slug]`, and `/demo/videos/[slug]` mirror the public
site but read from a **separate database** (`DEMO_DATABASE_URL`), so you can
run a live simulated demo on the same deployment as your real production
site without any risk of demo content ending up mixed into real church data.
It's intentionally not linked from the Navbar — reachable only by visiting
`/demo` directly.

Setup:

1. Provision a second Postgres database (any provider — this doesn't need
   to be the same one as your main `DATABASE_URL`).
2. Add `DEMO_DATABASE_URL` with that connection string to your environment
   (Vercel: Settings -> Environment Variables, Production).
3. Log in as an admin and open **Admin -> Demo Setup** (`/admin/demo`), then
   click **Run demo setup**. This calls `POST /api/admin/demo/setup`, which:
   - Creates the schema in the demo database (raw SQL — the demo database
     may not support running `prisma db push`/`migrate` directly depending
     on the provider, so this runs from the deployed app instead, which
     always has a real network path to it)
   - Seeds the same demo content as `npm run db:seed`
   - Is safe to click more than once — it skips anything already there
4. Visit `/demo`.

**Managing demo content**: `/admin/demo` also links to Categories, Series,
Videos, and Files pages under `/admin/demo/*` — the exact same admin CMS
components as the real `/admin/*` pages, just pointed at the demo database.
Every admin API route (except `/api/admin/users`, which is never
per-database) accepts a `?target=demo` query param
(`src/lib/admin-target.ts`); the admin pages add it automatically based on
whether the current URL is under `/admin/demo` (`src/lib/use-admin-target.ts`).

If you ever change `prisma/schema.prisma`, regenerate the DDL embedded in
`src/lib/demo-schema.ts` with:
```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```
(drop the `CREATE SCHEMA` statement — some managed Postgres providers reject
it since `public` already exists by default).

## Useful scripts

- `npm run db:seed` — populate demo content (see Setup step 4)
- `npm run db:studio` — browse the database with Prisma Studio
- `npm run build` — production build
