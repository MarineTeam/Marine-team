# Media Library

A Subsplash-style media library: Auth0 login, an admin CMS for managing
series/categories/videos/files, video hosted on Bunny Stream, and downloadable
files hosted on Bunny Storage.

See [FEATURES.md](./FEATURES.md) for the full feature list and
[CHANGELOG.md](./CHANGELOG.md) for release history.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- `@auth0/nextjs-auth0` for login/session (Regular Web Application flow)
- Bunny Stream (video) + Bunny Storage (files), uploaded directly from the
  browser via TUS so large files never pass through the app server

## Setup

1. Copy `.env.example` to `.env` and fill in real values:
   - A Postgres connection string for app traffic (`DATABASE_URL`, pooled/PgBouncer)
     and a direct connection string for migrations (`DIRECT_URL`) — see the
     comments in `.env.example`. Using a low-connection-limit "migration only"
     role for `DATABASE_URL` at runtime causes
     `too many connections for role ...` errors under load.
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
  list of optional features with a site-wide Active/Inactive toggle, plus
  per-category overrides — e.g. disable Comments just under "Kids" while
  leaving it on everywhere else. Nearest-ancestor override wins; falls back
  to the site-wide default. `src/lib/plugins.ts` has the plugin registry and
  `isPluginEnabled()`. Current plugins:
  - **Favorites** / **Watch later**: two independent per-user lists (bookmark
    vs. queue) at `/favorites` and `/watch-later`.
  - **Comments**: see above.
  - **Related content**: see above.
  - **Ratings**: a 1-5 star rating on a series/video; average + count shown
    to everyone, the star row itself is only clickable when logged in.
  - **View counts**: a simple counter incremented on each page load — no
    dedup/anti-spam, it's a basic "how many hits" number, not analytics.
  - **Social share**: copy-link plus share-to-X/Facebook buttons.
  - **Announcements** (`/admin/announcements`): a dismissible (per-browser-
    session) site-wide banner; only the newest `active` one shows, checked
    site-wide only (no per-category override — it's a global message).
  - **Notifications**: Web Push to subscribed members when an admin flips a
    video from unpublished to published (see PWA below) — a no-op if VAPID
    keys aren't configured.
  - **Subscriptions** (`/subscriptions`): follow a series or category; its
    subscribers get a targeted push notification when it publishes a new
    video, on top of the general Notifications above.
  - **Playlists** (`/playlists`): member-created, reorderable video
    playlists, separate from the single Watch Later queue.
  - **Likes / dislikes**: a thumbs up/down on a series or video, alongside
    (and independent from) the star Ratings plugin.
- **Sequential unlock**: a per-series "Require watching in order" toggle
  (`Series.requireSequential`, set on the series edit page — not a plugin,
  since it's a property of one series rather than a site feature). When on,
  a video is locked until the previous one (by position) is marked
  `completed` in the viewer's `WatchProgress`; anonymous viewers (no
  progress tracking) are never locked out by this.
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
- **Granular viewing permissions**: beyond the plain "Members only"
  checkbox, a series or video's edit page has a "Restricted viewing" panel
  (`src/components/viewer-access-manager.tsx`) that grants view access to
  specific permission groups (reusing the groups from Permissions above as
  "roles") and/or specific people by email. As soon as either exists for an
  item, "Members only" is ignored for it and only those roles/people (plus
  admins) can view it — checked by `canViewSeries`/`canViewVideo` in
  `src/lib/content.ts`. With no grants, behavior is unchanged. This only
  applies to series and videos, not files, which stay governed by their own
  "Members only" flag.
- **Continue watching / recently added**: logged-in users get a periodic
  heartbeat (`src/components/watch-progress-tracker.tsx`) that approximates
  watch position (Bunny's iframe embed has no documented postMessage API
  for exact play/pause/seek events, so this is elapsed-time based, not a
  precise scrub position) — the homepage shows a "Continue watching" row
  from that, resuming playback near where you left off via Bunny's `t=`
  embed parameter, plus a "Recently added" row of newest published series.
- **Trending / Up next / premieres**: the homepage shows a "Trending this
  week" row (from a timestamped view log, distinct from the simple
  `viewCount` counter); video pages show an "Up next" panel with an
  autoplay toggle for the next episode in the series; a video can be marked
  a premiere with a future publish time to show a live countdown instead of
  staying fully hidden until then.
- **Admin analytics** (`/admin/analytics`, `view_analytics` capability):
  30-day view totals and top series/videos, from the same view log.
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
- **PWA**: `public/manifest.json` + `public/sw.js` make the site installable
  (Add to Home Screen / desktop install prompt) and able to receive Web Push.
  The service worker deliberately does **not** cache pages or API responses —
  this site's content is dynamic and often auth-gated, so an aggressive
  offline cache would risk showing stale or wrong-audience content; it only
  caches its own static shell assets (manifest + icons) and handles `push`/
  `notificationclick` events for the Notifications plugin. Icons are plain
  placeholders (`public/icon-192.png`, `public/icon-512.png`) — swap them for
  real branding whenever you like.

## Performance notes

Written for a Postgres free tier, where every query counts:

- `getCurrentUser()`/`getSessionIdentity()` (`src/lib/current-user.ts`) are
  wrapped in React's `cache()` so the many call sites that each need the
  current user in a single request (root layout's Navbar, the page itself,
  admin layout, ...) share one query instead of hitting the DB repeatedly.
- `getPluginStates()` (`src/lib/plugins.ts`) resolves every plugin's
  enabled state for a page in one pass (2-3 queries total, regardless of
  category-tree depth or how many plugins exist) instead of checking each
  plugin individually — use it instead of calling `isPluginEnabled()` in a
  loop or a `Promise.all` of several calls.
- Series/video pages fetch ratings, reactions, and comments server-side and
  pass them down as initial props instead of letting the client component
  fetch on mount, and skip that work entirely when the relevant plugin is
  off rather than fetching and hiding it in the UI.
- `ViewEvent` writes (Trending/Analytics) go through a client-side beacon
  (`/api/view-events`, `src/components/view-event-beacon.tsx`) throttled by
  a 30-minute cookie rather than a DB check — a cookie read is free, so a
  throttled repeat view costs zero database operations.

## Useful scripts

- `npm run db:studio` — browse the database with Prisma Studio
- `npm run build` — production build
