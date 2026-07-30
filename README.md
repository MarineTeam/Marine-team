# Marine Team

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
   - A Postgres connection string (`DATABASE_URL`)
   - An Auth0 "Regular Web Application" (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
     `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` — generate with `openssl rand -hex 32`)
     - In the Auth0 app settings, set Allowed Callback URLs to
       `http://localhost:3000/auth/callback` and Allowed Logout URLs to
       `http://localhost:3000`
   - `ADMIN_EMAILS`: comma-separated emails granted the `ADMIN` role on login
   - `CRON_SECRET` (optional): when set, the daily notification-digest cron
     route only accepts requests carrying it as a bearer token. Vercel Cron
     sends this automatically. Leave unset locally; set it in production so
     the route can't be triggered from outside to mass-send pushes.
   - A Bunny Stream video library (`BUNNY_STREAM_*`) and a Bunny Storage zone
     with a public pull zone (`BUNNY_STORAGE_*`)
     - If the Stream library has **Token Authentication** enabled (Library ->
       Security in the Bunny dashboard), also set
       `BUNNY_STREAM_TOKEN_AUTH_KEY` to the "Token Authentication Key" shown
       there (a different secret from `BUNNY_STREAM_API_KEY`) — otherwise
       the video player and thumbnails will 404. Leave it unset if token
       auth is off.
   - `RESEND_API_KEY`/`EMAIL_FROM` (optional): enables the Notifications
     plugin's opt-in email channel. Leave both unset locally — email sends
     become a no-op, same as leaving the Web Push `VAPID_*` keys unset.
2. Install dependencies and generate the Prisma client:
   ```bash
   npm install
   ```
3. Apply the schema to your database:
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
  names, series titles/descriptions, and video titles/descriptions, falling
  back to a typo-tolerant fuzzy title match when that finds nothing.
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
  capability holders can delete any. Gated by the `comments` plugin. Any
  other logged-in member can **report** a comment (`CommentReport`, one per
  member per comment); reported or already-hidden comments surface in
  `/admin/comments` (`getReportedComments()` in `src/lib/content.ts`,
  scoped to a moderator's own categories/series via `getCapabilityScope()`
  unless they hold a site-wide grant), where a moderator can hide
  (`Comment.hidden`, excluded from public reads) or permanently delete.
- **Related content**: series pages show a "More like this" row (same
  category, then shared tags); video pages show "More from this series" or
  "You might also like" for standalone videos. Gated by the
  `related-content` plugin.
- **Relevance-ranked search**: `/search` and the navbar search box rank
  results by how well they match — an exact or prefix title match outranks
  a description-only hit — across categories, series, videos, and speaker
  names, with optional category/speaker filters and a relevance-vs-newest
  sort. When the exact pass returns no series (or no videos), a fuzzy
  fallback re-ranks candidates by Postgres trigram similarity (`pg_trgm`,
  via the GIN indexes added in the `search_trigram_indexes` migration) so a
  typo like "chruch" still finds "Church". It only runs on an empty result,
  so the common case pays no extra query.
- **Speakers**: an admin-managed directory (`src/app/admin/speakers`) of
  preachers/presenters, attachable to a video from the video manager.
  `/speakers` and `/speakers/[slug]` list them and their published videos.
- **Scripture references**: free-form Bible references on a video (e.g.
  "John 3:16-18"), edited from the video manager's "Scripture" panel and
  browsable at `/scripture` and `/scripture/[book]` (`scriptureBook()` in
  `src/lib/content.ts` derives the book from the leading text of a reference).
- **Live streaming** (plugin): `LiveStream` rows point at a stream already
  hosted elsewhere (YouTube, Boxcast, etc. — Bunny Stream has no live
  ingest). `/live` shows the current stream when live, a countdown to the
  next scheduled one otherwise, and a "Live now" banner appears on the
  homepage and nav while one is live. Publishing a stream pushes a
  notification the same way publishing a video does.
- **Sitemap**: `/sitemap.xml` (`src/app/sitemap.ts`, backed by
  `getSitemapData()`) lists published categories and series, guest-visible
  videos, every distinct series tag, every speaker, every distinct
  scripture book, and `/live`. It's `force-dynamic` because the
  database isn't reachable at build time here, same as the root layout, and
  it uses `APP_BASE_URL` for absolute URLs.
- **Closed captions**: each row of the admin video list has a **Captions**
  button for uploading a `.vtt`/`.srt` track per language code and removing
  it later. Captions are stored in Bunny Stream rather than locally (no new
  `Video` column, no local copy) via `bunnyAddCaption`/`bunnyDeleteCaption`
  in `src/lib/bunny.ts`, and Bunny's embed player adds a CC toggle by itself
  once a track exists. This is separate from the Transcripts plugin, which
  renders a searchable text panel beside the video instead of subtitles.
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
    session) site-wide banner; only the newest `active` one matching the
    viewer's login state shows, checked site-wide only (no per-category
    override — it's a global message). Two optional refinements on top of
    `active`: a `publishAt`/`expiresAt` scheduling window, and an
    `audience` (`ALL`/`GUESTS`/`MEMBERS`) targeting the banner to logged-out
    visitors, logged-in members, or everyone — `getActiveAnnouncement()`
    takes the viewer's login state and is cached per state (guest vs.
    member), not globally, since the result now differs by audience.
  - **Notifications**: Web Push to subscribed members when an admin flips a
    video from unpublished to published (see PWA below) — a no-op if VAPID
    keys aren't configured. Members choose a frequency on `/profile`:
    `INSTANT` (default, unchanged behavior) pushes immediately, while
    `DAILY` queues a `PendingNotification` row per event that the digest
    cron batches into one push a day (see Deployment below). A member can
    also opt into `User.emailNotifications` — a separate, always-instant
    email channel (`src/lib/email.ts`, via the Resend API, a no-op without
    `RESEND_API_KEY`/`EMAIL_FROM`) sent alongside push regardless of the
    `INSTANT`/`DAILY` choice, which only governs push timing.
  - **Subscriptions** (`/subscriptions`): follow a series or category; its
    subscribers get a targeted push notification when it publishes a new
    video, on top of the general Notifications above.
  - **Playlists** (`/playlists`): member-created, reorderable video
    playlists, separate from the single Watch Later queue. `Playlist.public`
    (toggled from the playlist page) lets anyone with the link view it
    read-only at `/playlists/[id]` without an account — `getPublicPlaylist()`
    in `src/lib/content.ts` only resolves when that flag is set; otherwise
    the route falls through to the existing owner-only `getPlaylist()`.
  - **Likes / dislikes**: a thumbs up/down on a series or video, alongside
    (and independent from) the star Ratings plugin.
  - **Live streaming**: see above.
  - **Sermon notes**: a member's own private, timestamped notes on a video
    (`SermonNote`), added from a panel on the video page and exportable as a
    text file. The timestamp field is prefilled once from the same
    elapsed-time heartbeat used for Continue watching, then edited freely —
    it isn't kept in sync with real playback (see the technical notes below).
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
  embed parameter, plus a "Recently added" row of newest published series. A
  "Mark as watched" toggle on the video page (`MarkWatchedButton`) sets or
  clears `WatchProgress.completed` directly — the same completion flag that
  gates Sequential unlock and feeds the watch-through-rate analytics —
  independent of the heartbeat, which only ever sets it to `true`, never
  back to `false` (a stray heartbeat must not silently undo a completion).
- **Trending / Up next / premieres**: the homepage shows a "Trending this
  week" row (from a timestamped view log, distinct from the simple
  `viewCount` counter); video pages show an "Up next" panel with an
  autoplay toggle for the next episode in the series; a video can be marked
  a premiere with a future publish time to show a live countdown instead of
  staying fully hidden until then.
- **Admin analytics** (`/admin/analytics`, `view_analytics` capability):
  view totals and top series/videos for a selectable window (`?days=7|30|90`),
  from the same view log, plus a CSV/JSON export of the same data
  (`/api/admin/analytics/export`) for pulling into a spreadsheet.
- **Homepage rows** (`/admin/home-rows`, `manage_plugins` capability): a
  `HomeRow` per built-in section (seeded once via `ensureHomeRowsSeeded()`)
  lets an admin toggle, rename, and reorder Continue watching/Because you
  watched/Trending/Recently added, plus add curated `CATEGORY`/`TAG` rows.
  `getHomeRows()` falls back to the default built-in order when nothing's
  configured yet, the same fail-open pattern as `getPluginStates()`.
  Continue watching (when shown) always renders directly above the
  category/series browse list, which itself isn't a configurable row.
- **Trash** (`/admin/trash`): deleting a category, series, video, or file
  now sets `deletedAt` instead of removing the row (`publishedNow()` in
  `src/lib/content.ts` excludes it everywhere public, and every admin list
  route filters it too). Restore clears `deletedAt`; permanent delete
  (`/api/admin/trash/[type]/[id]` `DELETE`) is the only point a video/file's
  underlying Bunny Stream/Storage asset is actually removed — trashing alone
  leaves it in place, unlike before. Gated on holding at least one of
  `manage_categories`/`manage_series`/`manage_videos`/`manage_files`
  site-wide (or `ADMIN`), since the queue spans all four types at once.
  Trashing a category/series doesn't cascade: a child row keeps its
  `categoryId`/`seriesId` as-is and just stops appearing in listings that
  traverse through the trashed parent, while staying reachable directly by URL.
- **Slug aliases**: changing a series/video's `slug` from its edit page
  records a `SlugAlias` (old slug -> current id); the `/series/[slug]` and
  `/videos/[slug]` pages fall back to resolving one when the direct lookup
  finds nothing, then `permanentRedirect()` to the current slug — so a link
  shared before a rename still works instead of 404ing.
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
  `notificationclick` events for the Notifications plugin. Icons are rendered
  from two committed SVG sources — `public/icon.svg` and the full-bleed
  `public/icon-maskable.svg`, whose artwork sits inside the 80% safe zone
  because launchers apply their own mask. Editing an SVG means re-rendering
  the PNGs beside it. The service worker caches the icons by name, so bump
  its `CACHE_NAME` when they change or installed PWAs keep the old artwork.

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
- **Query Monitor**: set `QUERY_MONITOR_ENABLED=true` to get a
  WordPress-Query-Monitor-style debug bar at the bottom of every page —
  query count/time, a per-query breakdown, page render time, and process
  memory — so the query counts above are something you can actually watch
  rather than take on faith. Two switches gate it: that env var (a redeploy
  to flip) and a DB-backed admin switch on `/admin/query-monitor` (no
  redeploy — e.g. to hide the bar mid-demo); both must be on, and even then
  it only renders for logged-in `ADMIN` users. The admin switch reuses the
  `Plugin` table (slug `"query-monitor"`) but is deliberately excluded from
  `PLUGIN_META`/`/admin/plugins`, since it's an ops toggle with no
  per-category meaning — `/api/admin/plugins` filters to `PLUGIN_META`'s own
  slugs so it doesn't show up there with a nonsensical "Category overrides"
  control. `src/lib/db.ts` wraps every Prisma model call in a client
  extension that's a no-op unless the *env* flag is set — checking the DB
  switch too would add a query to every query, so recording only depends on
  the env flag and the DB switch purely gates whether the bar renders;
  `src/lib/query-monitor.ts` tallies per request via React's `cache()`
  (the same primitive `getCurrentUser()` uses), so concurrent requests never
  mix each other's counts — verified by firing concurrent requests with
  known, distinct query counts and confirming none leaked into another's tally.
  Client-side `<Link>` navigations reuse the root layout's previous render
  instead of re-executing it (Next's "partial rendering"), so
  `QueryMonitorRefresher` forces a `router.refresh()` on every path change
  while the bar is mounted, otherwise it'd keep showing whichever page
  triggered the last full load — verified with a real browser clicking
  between routes with different query counts and confirming each one's
  numbers actually updated.

## Testing & CI

`npm test` runs the vitest suite in `src/lib/*.test.ts`. It covers the pure
and query-shaping logic that tends to break silently — `canAccess`,
`categoryChainIds`, sequential-unlock derivation, `hasCapability` and
category-scope resolution, plugin override precedence, and `reorderArray`.
`@/lib/db` is mocked throughout, so the suite needs no database and no
environment variables.

`.github/workflows/ci.yml` runs on every pull request and every push to
`main`: type check (`tsc --noEmit`), lint (`eslint .`), `npm test`, then
`prisma validate` and `prisma format --check`. That last check is why an
unformatted schema fails CI — run `npx prisma format` after editing
`prisma/schema.prisma`. CI installs with a placeholder `DATABASE_URL`
because `postinstall` runs `prisma generate`, which reads the datasource
block but never connects; CI never needs real credentials.

## Deployment

Vercel builds run `prisma migrate deploy && next build` (see `vercel.json`).
Schema changes are tracked as migration files under `prisma/migrations/` —
`prisma db push` is no longer used anywhere, because it has no history, no
rollback, and refuses (or destroys data) on changes it can't make in place.

The `search_trigram_indexes` migration runs `CREATE EXTENSION IF NOT EXISTS
pg_trgm`, which needs the database user to have (or be granted) that
privilege — already the case on Prisma Postgres, Neon, Supabase, and RDS
with `rds_superuser`, but worth checking on a locked-down managed instance.

**The trigram GIN indexes have no representation in `schema.prisma`** (raw
SQL, not the Prisma DSL), so the next time `prisma migrate dev` diffs the
schema it will propose `DROP INDEX` for all of them as apparent drift —
seen firsthand while adding the `home_rows_comment_moderation_email`
migration. Strip any such `DROP INDEX ..._trgm_idx` lines from a
freshly-generated migration before applying it, the same way that one had them removed.

To change the schema:

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate` locally to generate and apply a migration.
3. Commit the generated `prisma/migrations/<timestamp>_<name>/` directory
   **with** the schema change. Without it the deploy has nothing to apply.

### Scheduled jobs

`vercel.json` declares two crons, both guarded by the same `CRON_SECRET`
bearer-token check (Vercel Cron attaches it automatically):

- `/api/cron/notification-digest`, daily at 13:00 UTC. Batches every queued
  `PendingNotification` per user into a single push and clears the queue —
  the only delivery path for members who chose the "Daily digest" frequency;
  if this cron isn't running, their notifications pile up and never arrive.
- `/api/cron/sync-video-status`, daily at 06:00 UTC. Polls Bunny for every
  video still stuck in `PROCESSING` and reconciles its status/duration/
  thumbnail, the same as the admin's manual "Sync from Bunny" button — so a
  finished encode doesn't sit unprocessed until someone happens to click
  refresh. Daily is the Hobby-plan-safe cadence (Vercel's free tier only
  allows once-a-day cron schedules); a Pro plan can tighten this to run
  every few minutes if stuck videos need to resolve faster.

### Preview deployments need their own database

Vercel exposes one `DATABASE_URL` to every environment unless you scope it,
so an unscoped value means **preview builds run `migrate deploy` against
production** — a migration in an unmerged PR would hit real data before
anyone reviewed it.

In Vercel → Settings → Environment Variables:

- Scope the production connection string to **Production** only.
- Add a second `DATABASE_URL`, scoped to **Preview**, pointing at a separate
  database.

For Prisma Postgres, create that second database in
[Prisma Console](https://console.prisma.io) or with the Platform CLI:

```bash
npx -y @prisma/cli@latest database create preview --branch main
npx -y @prisma/cli@latest database connection create <database-id>
```

The connection URL is shown **once** at creation — copy it straight into
Vercel. It looks like
`postgres://<id>:<key>@db.prisma.io:5432/postgres?sslmode=require`.

No baselining is needed for a fresh preview database: it starts empty, so the
first preview build applies `0_init` and every later migration normally. (The
production database needed a one-time
`prisma migrate resolve --applied 0_init` because its tables already existed
from the old `db push` era — that's already done.)

## Useful scripts

- `npm run db:migrate` — create and apply a migration locally (`migrate dev`)
- `npm run db:deploy` — apply pending migrations (what Vercel builds run)
- `npm run db:baseline` — mark `0_init` as already applied, for adopting
  migrations on a database whose tables already exist
- `npm run db:studio` — browse the database with Prisma Studio
- `npm test` — run the vitest unit suite (no database needed)
- `npm run lint` — ESLint over the project
- `npm run build` — production build
