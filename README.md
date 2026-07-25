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
4. Start the dev server:
   ```bash
   npm run dev
   ```

## How it works

- **Public site** (`/`, `/categories/[slug]`, `/series/[slug]`, `/videos/[slug]`,
  `/search`): browse published categories/series as a vertical list of tiles
  (thumbnail, title, item count), watch videos (embedded Bunny Stream player),
  download files. Content flagged `memberOnly` requires login. Categories can
  nest arbitrarily deep (a category's children can themselves have children)
  via `Category.parentId` — the homepage shows top-level categories and any
  uncategorized series as tiles, each category tile linking to a
  `/categories/[slug]` page that shows that category's own series plus a tile
  for each child category, recursively. The search box in the navbar (and the
  `/search` page) does a case-insensitive substring search across category
  names, series titles/descriptions, and video titles/descriptions.
- **Ordering**: every list (categories, series, videos, files) has a
  `position` field. The admin CMS shows ↑/↓ buttons next to each item to
  reorder it among its siblings — categories among the same parent, series
  within the same category, and videos/files within the same series — which
  is what every public listing sorts by.
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
- **Admin CMS** (`/admin`): manage categories, series, videos, and files.
  Video upload creates a placeholder in Bunny Stream, signs a TUS upload
  session, and streams the file straight from the browser to Bunny; small
  files (≤4.5MB) are uploaded to Bunny Storage via the server. Beyond
  `ADMIN`, an admin can grant a `MEMBER` **content-editor** access to one
  category (and everything under it) or one specific series from
  `/admin/users` — that scopes their `/admin` view to just series/videos/
  files they're allowed to touch (`src/lib/permissions.ts` enforces this
  server-side on every admin API route, not just in the UI).
- **Featured/pinned**: a series can be marked `featured` (used for the
  homepage hero, overriding the recency-based default) or `pinned` (sorts
  first in its listing regardless of `position`) from its edit page or the
  series/category admin lists.
- **Tags**: series can have free-form tags, shown as chips on the series
  page and searchable; `/tags/[tag]` lists everything with a given tag.
- **Scheduled publishing**: series/videos/files can have a `publishAt`
  timestamp — even if `published` is true, the item stays hidden from the
  public site until that time passes. They can also have an `unpublishAt`
  timestamp (set from the series edit form, or via "Set expiry" on the
  video/file admin lists) so time-limited content disappears automatically
  without a manual unpublish step.
- **Bulk actions & filtering**: the series/video/file admin lists support
  multi-select (Publish/Unpublish/Delete) and a title filter box; selected
  series can also be bulk-moved to a different category (or uncategorized)
  in one action, and any series row can be recategorized inline.
- **Audit log** (`/admin/audit`, needs the `view_audit_log` capability): an
  append-only record of admin/editor create/update/delete/grant/revoke
  actions, exportable as CSV or JSON for offline/compliance review.
- **Favorites**: logged-in users can bookmark a series or video from its
  page; `/favorites` lists everything they've saved. Gated by the
  `favorites` plugin (see Plugins below).
- **Comments**: logged-in users can leave comments on a series or video
  page; authors can delete their own, admins or `moderate_comments`
  capability holders can delete any. Gated by the `comments` plugin.
- **Related content**: series pages show a "More like this" row (same
  category, then shared tags); video pages show "More from this series" or
  "You might also like" for standalone videos. Gated by the
  `related-content` plugin.
- **Relevance-ranked search**: `/search` and the navbar search box rank
  results by how well they match — an exact or prefix title match outranks
  a description-only hit — rather than raw database order.
- **Plugins** (`/admin/plugins`, needs `manage_plugins`): a WordPress-style
  list of optional features (Favorites, Comments, Related content) with a
  site-wide Active/Inactive toggle, plus per-category overrides — e.g.
  disable Comments just under "Kids" while leaving it on everywhere else.
  Nearest-ancestor override wins; falls back to the site-wide default.
  `src/lib/plugins.ts` has the plugin registry and `isPluginEnabled()`.
- **Permissions** (`/admin/permissions`, needs `manage_permissions`): a
  phpBB/WordPress-style permission builder — define named groups (e.g.
  "Moderators") as a custom bundle of capabilities from a fixed list
  (`src/lib/capabilities.ts`: manage categories/series/videos/files, publish
  content, moderate comments, manage users/permissions/plugins, view audit
  log), then assign a group to a user site-wide or scoped to one category
  (and everything under it) or one series. This sits alongside the older
  simple per-category/series "content-editor" grants in `/admin/users` —
  both are checked by `src/lib/permissions.ts`. The real `ADMIN` role
  always has every capability and can't be granted through a group (only
  another `ADMIN` can promote someone to `ADMIN`, to avoid a
  privilege-escalation hole via a custom "manage_users" group).
- **Continue watching / recently added**: logged-in users get a periodic
  heartbeat (`src/components/watch-progress-tracker.tsx`) that approximates
  watch position (Bunny's iframe embed has no documented postMessage API
  for exact play/pause/seek events, so this is elapsed-time based, not a
  precise scrub position) — the homepage shows a "Continue watching" row
  from that, resuming playback near where you left off via Bunny's `t=`
  embed parameter, plus a "Recently added" row of newest published series.
- **Feeds**: `/feed.xml` is a site-wide RSS feed of recently added series;
  `/series/[slug]/podcast.xml` is an iTunes-compatible podcast feed of a
  series' published audio files (skipped for `memberOnly` series, since
  podcast apps can't authenticate).
- **Bunny Stream playback**: `bunnyStreamEmbedUrl()` and
  `bunnyStreamThumbnailUrl()` (`src/lib/bunny.ts`) build the iframe/thumbnail
  URLs fresh on every request. If `BUNNY_STREAM_TOKEN_AUTH_KEY` is set, they
  sign a short-lived `token`/`expires` pair per Bunny's token authentication
  formula (`sha256_hex(tokenAuthKey + videoId + expires)`); if it's unset,
  plain unsigned URLs are used instead.

## Useful scripts

- `npm run db:studio` — browse the database with Prisma Studio
- `npm run build` — production build
