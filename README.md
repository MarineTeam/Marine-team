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
   - Two Postgres connection strings, not interchangeable:
     **`POOLED_DATABASE_URL`** (what the running app queries through; a
     serverless deployment opens one connection per concurrent function
     instance and needs a pooler to survive that) and **`DATABASE_URL`**
     (direct, unpooled — what `prisma migrate deploy`/`db push` use, since
     poolers don't support the DDL statements migrations issue). The
     direct-one-is-`DATABASE_URL` asymmetry is deliberate; see
     [Deployment](#deployment) for why. On Prisma Postgres, take both from
     Console → your database → **Connect to your database**, where they're
     labelled by client rather than by pooling — match them by protocol: the
     **"Prisma ORM"** string
     (`prisma+postgres://accelerate.prisma-data.net/?api_key=…`) is the pooled
     one, since Accelerate has pooling built in, and works natively with
     `@prisma/client` 6.x with no extension to install; the **"Any Client"**
     string (`postgres://…@db.prisma.io:5432/…`) is the direct one. Pointing
     runtime queries at the direct string is what produces "too many
     connections for role" once real traffic hits, since that role's cap is
     sized for a migration's brief burst. On Neon/Supabase use their pooled
     endpoint (Neon's `-pooler` host, Supabase's port 6543) for
     `POOLED_DATABASE_URL`; with no separate pooled endpoint at all, both can
     be the same value.
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
  to Proxy, and Proxy runs in the Node.js runtime, so Prisma works there).
  Access is decided from **two** independent checks — by default both must
  pass, but `AUTHORIZATION_MODE` (below) can relax that to either one alone:
  1. **Membership of an approved Auth0 organization.** `AUTH0_ORGANIZATION_ID`
     is a comma-separated list of accepted org ids. With exactly one
     configured, `src/lib/auth0.ts` sends it as `organization` on the
     authorization request, so Auth0 refuses non-members at the identity
     provider — a personal Google account never reaches the callback with a
     usable token. With two or more configured, that parameter is left out
     instead, so Auth0's own organization prompt shows and the member picks
     which one they're signing in to (requires "Prompt for Organization" on
     for this Application in the Auth0 dashboard). Either way,
     `isOrganizationMember()` re-checks the `org_id` claim of the *verified ID
     token* server-side against the same list. The parameter we send — or the
     choice made at Auth0's prompt — is a request; the claim is the proof.
     Membership is never read from anything the browser controls, and the
     check fails closed if `AUTH0_ORGANIZATION_ID` is unset.
  2. **An ACTIVE `AuthorizedEmail` row** in PostgreSQL, managed at
     `/admin/authorized-emails` ("Who can sign in"; the Grant/Revoke buttons
     on `/admin/users`, "Members & roles", write to the same list). Stored trimmed + lowercased behind a unique
     index, so casing and whitespace can't create a second row or dodge a
     lookup (`normalizeEmail()` is the only way an address is ever compared or
     written).

  **`AUTHORIZATION_MODE`** chooses how the two combine: `BOTH` (default, an
  AND — neither is enough alone), `ORGANIZATION` (membership only),
  `ALLOWLIST` (the list only), or `EITHER` (an OR — either is enough alone).
  Unset or unrecognised resolves to `BOTH`, and no value turns both checks off
  entirely. `EITHER` is the "personal account or organization account" mode:
  an organization member gets in without an allowlist entry, and someone with
  no organization still gets in with an ACTIVE entry — it also needs this
  Application's "Type of Users" set to "Both" (Login Experience tab in the
  Auth0 dashboard), or Auth0 itself will keep insisting on an organization
  before our check ever runs. In `ALLOWLIST` or `EITHER` mode the app also stops sending
  `organization` on the login request — otherwise Auth0 would reject
  non-members before the app's own check ran, which in `ALLOWLIST` mode would
  make it a no-op and in `EITHER` mode would block the personal-account path
  entirely. Both check results are still recorded on every refusal whatever
  the mode, and a relaxed or reshaped mode shows as a banner on
  `/admin/authorized-emails`.

  For a one-off guest rather than a deployment-wide policy change, an
  individual `AuthorizedEmail` row can be flagged **`organizationExempt`**
  ("Guest" in the UI): that one address gets in on an ACTIVE allowlist entry
  alone, with `AUTHORIZATION_MODE` staying at `BOTH` and everyone else still
  needing both checks. This is the narrower alternative to `EITHER` mode —
  `EITHER` changes the rule for every allowlisted address at once, an exempt
  row changes it for one address an admin named. Toggle it per row with the
  "Make guest" / "Require organization" button on `/admin/authorized-emails`.

  **A guest must sign in via `/auth/guest`, not the normal Log in button.**
  When an organization is required and configured, `/auth/login` names it on
  the authorization request, so Auth0 refuses a non-member at the identity
  provider — before the callback, and so before the allowlist is ever
  consulted. `/auth/guest` (`src/app/auth/guest/route.ts`) starts the same
  login with the `organization` parameter omitted, which is the only way a
  guest's request gets far enough to be judged on their exempt row. The route
  grants nothing by itself: `authorizeIdentity` still decides, and someone
  without an ACTIVE exempt row is refused exactly as before. It 404s when no
  organization is required, since the normal login already omits the
  parameter then. This also needs the Auth0 Application's "Type of Users" set
  to "Both" (Login Experience tab), or Auth0 insists on an organization even
  when we stop asking for one.

  **`/auth/guest` also has its own master switch**, closed by default: the
  "Guest sign-in link" toggle at the top of `/admin/authorized-emails`
  (backed by the `AuthSettings` singleton, `isGuestLoginEnabled()` /
  `setGuestLoginEnabled()` — a database row rather than an env var, so opening
  or closing it takes effect immediately with no redeploy). Closed, the route
  404s identically to the "no organization required" case, so its response
  doesn't reveal that a guest path exists at all; `/access-denied` only shows
  the guest link once it's open, so a stuck guest isn't pointed at a dead
  link. There's no reason to leave an org-skipping login path reachable once
  the guest who needed it is done — open it while inviting someone, close it
  after.

  Both run inside `getCurrentUser()` — the choke point every server-rendered
  page and API already goes through — so **revocation applies to existing
  sessions**: remove an email and that person is refused on their very next
  request, cookie or no cookie. `User.authorized` is kept in step with the
  decision so the older queries that read it stay correct.

  Signup is closed off separately by an Auth0 **Pre-User-Registration Action**
  that calls `POST /api/auth/registration-check` (bearer secret, 5s timeout,
  fails closed, returns only a boolean). The Action never holds database
  credentials — see `auth0-actions/README.md` for the source and the dashboard
  checklist.

  Every refusal — organization rejection, missing-state callback error, an
  unauthorized email, or a revoked session — lands on `/access-denied` with one
  plain message and no stack trace, Auth0 error, or Prisma detail. Because the
  SDK writes its session cookie *after* the `onCallback` hook returns,
  `src/proxy.ts` strips it from any response redirecting there, so no
  application session exists after a failed authorization. State, nonce, and
  CSRF validation are untouched.

  Refused attempts are recorded in `UnauthorizedAccessAttempt` (no tokens,
  codes, or passwords — only who was refused and why), shown at
  `/admin/access-attempts`, and pruned after 90 days by the daily cron. The
  first refusal for an address emails the admins; the same address is then
  left alone for an hour and no more than ten notifications go out per hour
  overall, both counted in Postgres (no Redis anywhere in this app).

  A callback-error attempt (Auth0 refused before the app ever saw an
  identity) also records `detail`: the Auth0 SDK's own error code/message,
  plus — since several error types (an organization rejection among them)
  leave their own `.message` at a fixed generic default — the underlying
  `error`/`error_description` Auth0 actually sent back, read from the SDK
  error's `.cause` (`getErrorCause()` in `src/lib/auth0.ts`). Still nothing
  but Auth0's own human-readable classification; never a token or secret.
  Also `console.error`'d immediately, so it's in Vercel's function logs even
  before anyone opens the admin page.
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
  - **Share links**: gates *creating* share links (see below). Revoking is
    deliberately never gated — turning this plugin off must not trap a member
    with links they can no longer switch off.
  - **Downloads**: offline viewing (see below).
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
  content, moderate comments, share restricted content, manage
  users/permissions/plugins, view audit log), then assign a group to a user
  site-wide or scoped to one category
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
- **Share links**: a revocable, tracked link to one series or video, opened at
  `/s/[token]`. Any member may share, including gated content — but a link only
  *overrides* a members-only/viewer restriction when the sharer ticks the
  override box, which needs the `share_content` capability (site-wide or scoped
  to a category/series). That opt-in is the "let this one guest in" path;
  without it the link opens only for people who already have access.
  Access-granting links are checked by `canViewSeries`/`canViewVideo` alongside
  the grants above. Redemption stores the token in an httpOnly cookie so access
  survives navigation, but the cookie is re-validated against the DB on every
  request — revoking is immediate. Links can be public or addressed to specific
  emails (which requires logging in as that address), can carry an optional
  scrypt-hashed password (`src/lib/share-password.ts`, unlocked at
  `/share/unlock/[token]` with a per-link lockout after repeated wrong
  guesses), can expire, and are listed for the sharer at
  `/profile/shared-links` and for admins at `/admin/share-links`. Split across
  `src/lib/share-access.ts` (redeem + resolve grants) and
  `src/lib/share-links.ts` (create, list, revoke) so `content.ts` can consult
  grants without importing the permission machinery it depends on; the stored
  password hash is stripped from every API response by a single DTO mapper.
- **Downloads**: members save videos to the device and play them offline.
  Four gates, all of which must pass: the plugin (site-wide, with the usual
  per-category override), a tri-state `downloadEnabled` on the
  video/series/category resolved most-specific-first
  (`resolveDownloadEnabled` in `src/lib/downloads.ts`), the `DownloadPolicy`
  singleton's audience (any member, or named permission groups/users), and its
  platform (web, installed PWA, or both). `/api/downloads/[videoId]` calls
  `canViewVideo` before any of it, so downloading can only ever narrow what a
  member can already watch. The file is a signed, short-lived Bunny **MP4**
  URL — requiring MP4 Fallback on the Stream library, since HLS segments can't
  be played offline by a `<video>` — streamed into Cache Storage under
  `/offline-video/<id>.mp4` and served back by the service worker, range
  requests included, so seeking works with no network. The downloaded list is
  per device and never reaches the server. Admin settings at
  `/admin/downloads`; member view at `/profile/downloads`.

  A plain page load with no network — including the installed PWA's own
  `start_url` on a cold launch — has no HTML to render and would otherwise hit
  the OS's own offline error, which has no way to reach a video already saved
  to the device. `public/sw.js` falls back to `public/offline.html` (precached
  at install time) for any navigation whose network request fails; that page
  is static and reads nothing but the same `localStorage` index and Cache
  Storage the download feature already writes, so it needs no server, no auth,
  and no build step.

  The MP4 rendition isn't assumed. Bunny reports `hasMP4Fallback` and
  `availableResolutions` per video — enabling MP4 Fallback on a library only
  affects uploads made afterward, so older videos routinely have neither —
  and `resolveMp4Source` (`src/lib/download-source.ts`) reads that instead of
  guessing a fixed height. It picks the highest available resolution at or
  under `BUNNY_STREAM_DOWNLOAD_HEIGHT` (default 720p), caches the result on
  `Video.hasMp4Fallback` / `Video.mp4Resolutions` so the member-facing request
  is a Postgres read rather than a Bunny API call, and returns a specific
  reason — no fallback generated, no resolution at or under the cap, Bunny/CDN
  rejected the request (403 — almost always a token-auth or pull-zone setting,
  not a missing file), or Bunny doesn't have the file (404) — rather than one
  catch-all "no downloadable file" message. `/admin/videos` shows each video's
  synced MP4 state; the sync-status routes (manual and cron) are what notice a
  video has become downloadable after a re-upload or Bunny repackage.
- **The profile area** (`/profile`): the member's account hub — inbox,
  shared links, downloads, and settings — shown identically on the web and in
  the PWA, with a Profile tab in the mobile bottom nav badged with the unread
  count. Notifications are persisted as `Notification` rows by
  `notifySubscribers`, so the inbox is a complete record regardless of whether
  push or email reached the member. Theme/language/autoplay/playback
  speed/download-network live in localStorage (`src/lib/device-settings.ts`),
  deliberately per device rather than on the `User` row; account-level
  settings and account deletion sit below them on `/profile/settings`.
- **Continue watching / recently added**: logged-in users get a periodic
  heartbeat (`src/components/watch-progress-tracker.tsx`) that approximates
  watch position (elapsed-time based, not a precise scrub position — Bunny's
  embed does support postMessage control via Player.js, see
  `video-player.tsx`, just not wired up here yet) — the homepage shows a
  "Continue watching" row
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
- **Book reader**: `/read/[fileId]` opens a PDF (pdf.js) or EPUB (epub.js)
  in-app, with contents, in-book search, read-aloud and marking. Both engines
  are dynamically imported inside an effect — each is large and touches
  browser globals on load — and sit behind one `ReaderHandle` interface
  (`src/components/reader-types.ts`), so `BookReader` never needs to know a
  PDF page number from an EPUB CFI. That's also why `ReadingProgress.location`
  and `ReadingMark.location` are opaque strings: only the engine that wrote
  one parses it.
  - Bytes are served by `/api/files/[id]/content` — the single route every
    file link now goes through, readers and downloads alike. See **File
    access** below for why. Range requests are forwarded so pdf.js can chunk
    large documents.
  - Books (and only books) are served `private, no-cache` rather than
    `private, no-store`, and conditional requests are forwarded to Bunny, so
    a re-open revalidates into a bodyless `304` instead of re-downloading —
    the access check still runs on every request, which `max-age` would have
    given up. A PDF under `WHOLE_BOOK_MAX_BYTES` is fetched whole rather
    than in ranges so there is a single cacheable resource to revalidate.
  - A resolved contents list is cached per device in `localStorage`
    (`src/lib/reader-cache.ts`), tagged with the file's size, because
    resolving a hymnal's bookmarks to page numbers is hundreds of round
    trips. `ReaderHandle.order` maps each engine's opaque locations onto one
    number line so `src/lib/toc-nav.ts` can step between contents entries
    without knowing which engine produced them.
  - A book can also be **saved to the device** (`src/lib/offline-books.ts`),
    which stores its bytes under `/offline-book/<id>.pdf` in Cache Storage,
    its contents list, and a copy of the reader it needs — pdf.js from
    `public/pdfjs`, or epub.js plus JSZip from `public/epubjs`, since the
    offline shell has no bundle to render with.
    `scripts/copy-offline-viewers.mjs` puts those there at install and build
    time so they track the pinned versions rather than being committed, and
    only the library a saved book actually needs is fetched.
  - A **hymn-per-file** book has no document to store, so
    `/api/offline/hymnal/[seriesId]` returns its hymns and lyrics (same view
    and plugin checks as the page) and they are cached as JSON under
    `/offline-hymnal/<id>.json`. Both kinds share one index, discriminated by
    `kind`.
- **A book's contents are indexed server-side** into `BookHymn` rows by the
  admin's cover/index pass (`derivePdfBook` resolves the outline in the
  browser, since that is where pdf.js runs, and PUTs it to
  `/api/admin/files/[id]/contents`, which parses the hymn number with the same
  `hymnNumberOf` the reader uses). That is what lets `searchHymnsInCategory`
  answer across a whole shelf, and lets `searchContent` find a hymn printed
  inside a scanned book. Pages are stored as PDF pages; the printed number is
  derived at the edge, as everywhere else. A PDF with no bookmarks indexes to
  nothing, so the same rows can be typed by hand instead — `ContentsEditor`
  parses the box with `lib/book-contents.ts` (printed pages in, PDF pages
  stored, indentation as nesting) and PUTs to the same route; the outline pass
  declines to send an empty list, which would otherwise replace a typed one.
- **A hymn inside a book can have words**, in `BookHymnLyric`, keyed by
  `(fileId, number)` rather than by a `BookHymn` row — those are deleted and
  rewritten on every reindex, and these are typed by hand. That is what makes
  a whole-book hymn presentable (`planItemPresentable`, `presentHref`,
  `/present/[fileId]?hymn=`) and findable by a line of its words
  (`hymnsMatchingWords`, which reads the words first and then the contents
  entries they belong to, since Prisma can't match a relation against the
  parent row's own column).
- **A scanned book's pages can be read** into `BookPage` — the file's own text
  layer where there is one, OCR off the image where there isn't
  (`BookTextReader` in the admin's browser; `lib/ocr-client.ts` points
  tesseract.js at this app's own `/tesseract`, vendored by
  `scripts/copy-offline-viewers.mjs`, rather than at a CDN). Stored a page at
  a time so an hour-long run is resumable and interruptible; `textIndexedAt`
  is set only by a run that reaches the last page. `searchBookText` then backs
  the reader's in-book search (falling back to parsing the open document for a
  book nobody has read), and `hymnsMatchingPages` attributes a matching page
  to the contents entry it falls inside, so a section search still returns
  hymns rather than page numbers.
- **A service's running order can be kept on the device** (`lib/offline-services.ts`,
  `/api/offline/service/[id]`): its own Cache Storage cache and localStorage
  index rather than the books' ones, since a plan is kept for one Sunday and
  thrown away after it. Fingerprinted with the shared `lib/fingerprint.ts` over
  what is actually handed out, so a `?probe=1` request answers "is the order I
  saved still the order" without re-fetching it. The offline shell renders it,
  and opens a hymn whose book is also saved.
- **Reading text size** (`readingTextScale` in `lib/device-settings.ts`) is one
  per-device value shared by the lyrics view, the EPUB reader and the offline
  shell — which both reads and writes it, so its clamp bounds are copied there
  and pinned by `offline-shell.test.ts`. EPUB scaling goes through
  `rendition.themes.fontSize` as a percentage: the book's pages live in an
  iframe with their own stylesheet, so a size set outside it reaches nothing.
- **Schedules are a second, separate rota system**, ported from the calendar
  app: `Schedule` / `ScheduleSource` / `CalendarEvent` / `Person`. The point of
  its shape is the provider layer — `lib/schedules/provider.ts` picks a
  `ScheduleProvider` (Google Sheets or the database) and nothing above it knows
  which, so a schedule can switch source without a component changing.
  `lib/sheets/` is the parsing (two layouts, forgiving dates, skip-and-report),
  `lib/schedules/sync.ts` the import (resolve names to people, never delete on
  failure, skip writes when the payload is unchanged).
  - Adapted rather than copied where this app already had the machinery: its
    `ApiError` folded into `errorResponse`, its audit into `logAudit`, its
    in-memory rate limiter dropped for this app's database-backed one, and
    `lib/schedules/http.ts` keeps the four idioms its twenty route handlers
    were written against so they port without a rewrite.
  - **The calendar goes on the device incrementally** (`lib/offline-calendar.ts`,
    `/api/sync/snapshot`): Cache Storage under `/offline-calendar/snapshot.json`
    like everything else saved here, rather than the calendar app's IndexedDB,
    so the static offline shell can read it with no bundle. What is stored is
    the *merge* rather than the server's bytes — `mergeSnapshot` is pure and
    carries the two rules a delta can't state, since disabling a schedule
    doesn't touch its events' `updatedAt` and a day leaving the window is
    never reported deleted. `Snapshot` lives in `lib/schedules/types.ts`, not
    beside the query that builds it, because the merging runs in a browser.
- **An event's capacity is decided under a row lock** (`lib/events.ts`):
  `SELECT … FOR UPDATE` on the `Event` row inside the transaction that writes
  the registration, so concurrent sign-ups for the last place serialise per
  event while other events proceed in parallel — and without the
  serialisation failures a `Serializable` transaction would make the caller
  retry. Reading the count outside the transaction and writing inside is the
  version of this that overbooks under load. Promotion off the waiting list
  happens in that same transaction, because "a place is free" and "you have
  it" must never be two facts another request can slip between.
  - The decision itself (`registrationState`, `promotable`) is pure and
    tested without a database, including the rule that promotion stops at the
    first party too big to fit rather than skipping to a smaller one.
  - `manage_events` is a new capability rather than a reuse of
    `manage_files`: a registration list carries names, phone numbers and
    addresses that the media library never does.
- **A form's questions are rows, and its answers point at those rows**
  (`lib/forms.ts` for the rules, `lib/forms-query.ts` for the reads). Two
  consequences are the design: renaming a question can't detach its answers,
  and deleting one is replaced by `deletedAt` — a hard delete would cascade a
  year of answers away, or leave them under a column nobody can name.
  `columnsFor` puts live questions first and retired ones after, so an export
  never silently drops what somebody actually said.
  - The split between those two files is load-bearing rather than tidiness:
    the fill-in component is `"use client"`, and one value imported from a
    module that reaches `lib/db` bundles PrismaClient into the browser.
    `client-bundle.test.ts` walks every client component's value imports
    transitively and fails on any that reach it — a class of bug that
    type-checks, lints and builds, and only shows up as a blank page.
- **The prayer wall's two decisions are one function each** (`lib/prayer.ts`):
  `canSee` for whether a reader may see a request at all, `bylineFor` for what
  they may be told about who wrote it. Every read path — the wall, the
  moderation queue, the API — goes through `visibleTo`, which composes them.
  The alternative is a `where` clause copied between four queries that
  eventually disagree, and here disagreement means somebody's name on
  something they asked to post anonymously.
  - Anonymity is not a missing column: the row keeps `userId` so the writer
    can delete their own and a moderator can act on abuse. It is enforced by
    `bylineFor` being the only place a name is allowed out, and by
    `VisiblePrayer` having no `userId` field to populate.
  - The narrowing `where` in `listPrayers` exists for the query planner;
    `visibleTo` is still what decides, so widening it cannot widen who sees
    what.
- **A small group's address is structurally hard to leak** (`lib/groups.ts`).
  `area` and `address` are separate columns; `presentGroup` is the only thing
  that decides whether the second travels, and `VisibleGroup` declares
  `address?` — absent rather than null when withheld, so a page that forgets
  to check renders nothing instead of a home. Verified against a running
  server: the string appears in neither the API response nor the page's HTML
  for a visitor, a signed-in stranger, or somebody who has only asked to join.
  - "Has asked to join" deliberately doesn't qualify. If it did, anyone with
    an account could learn a leader's address by pressing a button — the
    leader's answer is what turns a stranger into somebody who is coming.
  - Leaders act through `canLead` on their own group rather than through a
    capability: whoever hosts the Tuesday group shouldn't need an admin grant
    to answer somebody knocking on their own door.
- **A broadcast is resolved into rows before anything is sent**
  (`lib/broadcast.ts` for the rules, `lib/broadcast-send.ts` for the work).
  One row per person per channel with the address copied in, each marked as it
  goes — which is what makes a send resumable across a killed function, and
  what stops a changed phone number splitting a broadcast between the old one
  and the new. A unique index on `(broadcast, channel, address)` is the
  backstop against a double-clicked button.
  - The batch loop lives in the *browser*: the admin screen calls
    `/send` repeatedly. A single request that tried to send four hundred
    emails would be killed at the platform timeout with no record of how far
    it got, and this way the same mechanism produces a progress bar.
    `/api/cron/broadcasts` is the backstop for a closed laptop, not the
    delivery path.
  - `planDelivery` is pure and holds all three consent rules, so the count on
    the screen is the count that goes out. `smsOptIn` is deliberately not
    inferable from having a phone number: an event's sign-up form collects
    numbers, and that is not permission to text.
  - `sms.ts` (segment counting, number normalising) is split from
    `sms-send.ts` (providers) because the composer shows the cost as you type
    and so ends up in the browser bundle.
- **Translation is a typed object, not a key-path lookup** (`lib/i18n/`).
  `Messages` is derived from the English catalogue, so a language file missing
  or misspelling a key fails to compile — completeness needs no test. The test
  covers what types can't see: a translation that drops a `{placeholder}`,
  which loses a number from a sentence and still renders.
  - The chosen locale is a **cookie** as well as a device setting, because
    these pages are server-rendered and the server cannot read localStorage.
    Storing it only in the browser would mean every page arriving in the old
    language and flipping after hydration.
  - `pickLocale` parses `Accept-Language` with its quality weights and matches
    regional tags to their base language; it is pure and tested, including the
    case where the header asks for a language the app doesn't speak.
  - `device-settings.ts` keeps its own copy of the language list so that the
    module every page imports to read a preference doesn't pull two catalogues
    with it; `i18n.test.ts` asserts the copies agree.
- **`Video.source` decides which player fills the frame** (`lib/video-source.ts`).
  `bunnyVideoId` became nullable rather than an empty string, which made the
  type-checker enumerate every Bunny-only capability — downloads, captions,
  MP4 renditions, encode-status sync, transcription — and each now refuses an
  imported video with a reason instead of failing at the API call. The three
  players all take a start time, so chapters and resume work unchanged.
  - The sync (`lib/video-feed-sync.ts`) keeps `importedTitle` /
    `importedDescription` beside the live fields and only overwrites a field
    whose live value still equals the imported one. Without that three-way
    comparison every nightly sync silently undoes the edits made after the
    last one. A null `imported*` means "we don't know", which resolves to
    *don't touch* rather than to *overwrite*.
  - `lib/video-feeds.ts` is the provider layer, the same shape as
    `ScheduleProvider`: four feed kinds, two APIs, one `fetchFeed`.
- **Live chat polls; it does not hold a socket** (`lib/live-chat.ts`). Nothing
  here is long-lived enough to keep a connection open, so the client asks
  `?since=<id>` — one indexed range scan on `(streamId, id)`, usually
  returning nothing — and pauses the interval on `document.hidden`.
  - `visibleMessages` drops hidden rows *after* the query as well as in it, so
    a poll cannot hand a tab that was seconds behind a message a moderator has
    just removed. Hidden rather than deleted, so the same message can't be
    reposted past them.
  - `chatState` closes the chat an hour after a stream ends. An unattended
    comment box on an old stream is the failure mode this whole design is
    arranged against; the messages stay readable, the input goes.
  - Slow mode is computed per author (`waitSeconds`), not per stream.
- **Signing a television in is RFC 8628, not a password box**
  (`lib/tv-pairing.ts` for the rules, `lib/tv-session.ts` for the storage).
  The user code and the device code are two different secrets on purpose: the
  first is on a screen in a public room and only ever names a request; the
  second never leaves the television and is the only thing that can exchange
  an approval for a token. Both are stored hashed; the token is compared in
  constant time; `claimToken` is a conditional update, so two polls arriving
  together cannot both mint one.
  - `pollAnswer` checks expiry *before* "approved", so a code somebody
    approved and walked away from stops being redeemable rather than waiting
    for ever.
  - The feed routes use `force-dynamic` plus `s-maxage`, **not** `revalidate`:
    `revalidate` on a route with no dynamic input makes Next prerender it at
    build time, and the feed would then ship carrying whatever database the
    build machine saw. Same one-fetch-an-hour behaviour, always from live
    data.
  - `feedVideos` filters `memberOnly: false` on the video *and* on its series.
    That is the whole safety argument for the feature: there is no session on
    a request from Roku's crawler.
  - `/tv` covers the app chrome with `fixed inset-0` the way presenter mode
    does, rather than restructuring the root layout — a remote cannot use a
    sidebar, and on a television it would eat a fifth of the screen.
- **A rota lives beside the running order**: `ServiceTeam` / `ServiceTeamMember`
  are the pick-list, `ServiceAssignment` is one ask with its answer, and
  `ServiceBlockout` is when somebody is away. The job is free text on the
  assignment rather than a positions table — every church names those
  differently — and it defaults to `""` rather than null so the unique index
  over `(planId, userId, position)` actually constrains anything.
- **Automatic transcription is a queue on the video row** (`transcriptStatus`),
  drained one at a time by `/api/cron/transcribe`: an hour of audio takes
  minutes, which outlives a request. `lib/transcribe.ts` speaks the multipart
  `file` + `{ text }` shape every speech-to-text service implements, so the
  deployment picks the provider — including one on its own network.
- **A sermon note sheet is text with `___` in it** (`lib/outline.ts`), parsed
  into segments at render. Answers are keyed by a gap's position, and the
  outline's fingerprint travels with them so an edited sheet is reported
  rather than silently misaligned.
- **Hymn openings are counted in the browser** (`HymnLookup` + the beacon
  component of the same name), not on render: Next prefetches links on hover,
  so a server-side count would largely count hovering. Feeds "most looked-up
  hymns" in the admin analytics.
- **The bottom bar** is per device: `getShellNav` returns both the app's
  suggested `tabs` and every destination this viewer could choose
  (`tabOptions`), and `src/lib/nav-tabs.ts` resolves a stored list of hrefs
  against the latter — so a destination that disappears drops out instead of
  404ing. `BottomNav` also writes a snapshot of what it drew to
  `localStorage`, which is the only way `public/offline.html` can draw the
  same icons with no server. That file is a standalone offline app: the tab
  bar, the books and videos saved on the device, a book's cached contents,
  and a pdf.js page view, all from Cache Storage and `localStorage`, with the
  browser's own PDF viewer as the fallback where it can't render.
  - pdf.js's worker is resolved via `new URL(..., import.meta.url)` so it
    stays version-locked instead of needing a copy in `/public`; the build
    emits it to `.next/static/media`.
  - epub.js is opened with `openAs: "epub"` because it otherwise infers
    format from the URL extension, and the content route has none. Its
    bundled typings are also wrong in places (`Section.find()` is declared
    `Array<Element>` but returns `{cfi, excerpt}`), so that shape is declared
    locally.
- **File access**: `/api/files/[id]/content` is the only URL the app hands
  out for an uploaded file. It runs `canViewFile` against the live session
  per request, streams from Bunny with `bunnyStorageSignedUrl` (which signs
  when `BUNNY_STORAGE_TOKEN_AUTH_KEY` is set and passes through unsigned when
  it isn't), and forwards Range requests. `?download=1` switches
  Content-Disposition to `attachment`.
  - `bunnyStoragePublicUrl` still exists but nothing user-facing calls it.
    A pull-zone URL needs no login, can't be revoked, and can't express the
    rule this app actually has — a file's visibility follows its series'
    mutable `memberOnly` flag, so a static CDN path is the wrong shape for it.
  - **Locking the pull zone is a dashboard step, not a code one.** Enable
    Token Authentication (Pull Zone -> Security) and set the key; until then
    URLs already in circulation keep working even though the app has stopped
    producing them.
  - **Public podcast zone** (optional, off by default): a *separate* Bunny
    storage zone plus its own unauthenticated pull zone, holding only audio
    an admin explicitly published. `src/lib/podcast-mirror.ts` owns the
    lifecycle — `isMirrorEligible` is a pure, unit-tested predicate
    (`podcastPublished` is necessary but never sufficient; file and series
    audience, publish state and schedule all re-checked), and
    `syncPodcastMirror` reconciles the zone to it. It's called from every
    path that can change eligibility: `applyFileUpdate` (which the bulk
    route also goes through), `removeFile`, the series update and trash
    routes, and trash restore. Permanent deletion calls
    `purgePodcastMirror`, since deleting the private object doesn't touch
    the other zone.
  - `publicPath` is written only *after* a successful copy and cleared
    *before* deletion, so the two failure modes are "absent from the feed"
    rather than "advertised but missing" or "public but forgotten". Enclosure
    URLs are built from `publicPath`, never from `bunnyPath`, so a private
    object's path isn't derivable from a public one. `syncPodcastMirror`
    never throws — a Bunny outage shouldn't fail an admin's edit.
  - The copy streams rather than buffers (sermon audio is routinely
    hundreds of MB), but still passes through the function, so a large
    enough file can hit the request timeout. That's reported as a failed
    copy and leaves the file unmirrored.
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
- **Per-page metadata, OG images, and JSON-LD**: video/series/category/
  speaker pages export `generateMetadata` (title, description, an
  OpenGraph/Twitter image from the content's own thumbnail/cover/photo)
  instead of relying on the one static `metadata` in `src/app/layout.tsx`
  (which now also sets `metadataBase` from `APP_BASE_URL` so relative image
  paths resolve). The four slug lookups it shares with the page component
  (`getCategoryBySlug`/`getSeriesBySlug`/`getSpeakerBySlug`/
  `getVideoBySlugIncludingPremiere` in `src/lib/content.ts`) are wrapped in
  React's `cache()`, the same per-request-dedup pattern `getCurrentUser`
  already uses, so both callers share one query instead of two. A page for
  content the current viewer can't see returns a generic title/no image
  rather than the real ones — `generateMetadata` re-runs the same
  `canViewVideo`/`canViewSeries`/`canAccess` check the page body itself
  uses, rather than trusting that whatever's in the database is safe to
  publish as metadata. Video pages also emit a schema.org `VideoObject` and,
  alongside series/category pages, a `BreadcrumbList` (`src/lib/json-ld.ts`)
  — gated the same way, and paired with a real, visible `<Breadcrumbs>` nav
  (`src/components/breadcrumbs.tsx`) built from the same items, replacing
  the old bare "← back" link on video and (when unlocked) category pages.
  The JSON-LD script tag itself renders nothing — it's invisible metadata
  for search engines, not the visible trail.
- **Timestamp/clip sharing**: the video page reads a `?t=<seconds>` search
  param into `resumeAt`, which seeds `bunnyStreamEmbedUrl`'s `t=` param,
  taking priority over the viewer's own watch progress.
  `TimestampShareLink` (mm:ss input, `parseTimestamp` from
  `src/lib/format.ts`) builds that link, and each chapter row in
  `VideoPlayer` gets its own copy-link button using its own
  `timestampSeconds`.
- **Cast to TV**: `CastButton` (`src/components/cast-button.tsx`) integrates
  Google's Cast Web Sender SDK (loaded at runtime, no npm types package —
  see the file's local ambient types) and reuses the signed MP4 URL already
  built for the Downloads plugin (`/api/downloads/[videoId]`) as its cast
  source, since the default Chromecast receiver needs a direct file rather
  than an iframe embed; shown next to the download button, under the same
  `getDownloadAvailability` gate. AirPlay needs no equivalent code — Safari
  shows its own AirPlay control for any actively-playing `<video>`,
  including one inside a cross-origin iframe, since that's a system-level
  media route. **Note**: Bunny's embed turns out to have both of these
  built in already — a `chromecast=true` query param puts a native Cast
  button in Bunny's own player UI, and AirPlay is on by default
  (`disableAirplay` turns it off) — discovered after `CastButton` was
  already built; the two haven't been reconciled.
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
`prisma/schema.prisma`. CI installs with placeholder `POOLED_DATABASE_URL`
and `DATABASE_URL` values — `postinstall` runs `prisma generate`, and `prisma
validate` resolves the whole datasource block including `directUrl`, but
neither ever connects; CI never needs real credentials.

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

**Every schedule here runs at most once a day, and that is a hard constraint
rather than a preference.** Vercel's Hobby plan refuses anything more frequent
at *deploy* time — the whole deployment fails with "Hobby accounts are limited
to daily cron jobs" — so an hourly entry in `vercel.json` is not a job that
runs too often, it is a site that doesn't go live. `cron.test.ts` asserts it,
because nothing else in the build does. On a paid plan, tighten these and
delete that test deliberately.

`vercel.json` declares five crons, all guarded by the same `CRON_SECRET`
bearer-token check (Vercel Cron attaches it automatically), and all at
different minutes so two never share a run:

- `/api/cron/sync-schedules`, 05:30 UTC. Imports every Google Sheets schedule
  whose own interval has elapsed; a schedule set to sync more often than daily
  is effectively capped by this cadence. Before the reminders below, so they
  go out on the morning's data rather than yesterday's.
- `/api/cron/sync-video-status`, 06:00 UTC. Polls Bunny for every video still
  stuck in `PROCESSING` and reconciles its status/duration/thumbnail, the same
  as the admin's manual "Sync from Bunny" button — so a finished encode doesn't
  sit unprocessed until someone happens to click refresh.
- `/api/cron/notification-digest`, 13:00 UTC. Batches every queued
  `PendingNotification` per user into a single push and clears the queue —
  the only delivery path for members who chose the "Daily digest" frequency;
  if this cron isn't running, their notifications pile up and never arrive.
- `/api/cron/schedule-reminders`, 18:00 UTC. Tells people what they are on for
  tomorrow, one message however many rotas they are on.
- `/api/cron/transcribe`, 02:00 UTC. Works through the transcription queue.
  **Bounded by time, not by a count**: it takes as many videos as fit inside
  the function's own limit (`maxDuration`, and the shorter `BUDGET_MS` it stops
  starting new work at) and leaves the rest for tomorrow. It was one video per
  run on an hourly cron, which on a daily cadence would have meant one video a
  day — a church with forty untranscribed sermons waiting until Christmas. A
  run killed mid-transcription leaves that video `RUNNING`; the stale sweep in
  `transcribeNextQueued` re-queues anything stuck there for half an hour.
  - Note the honest limit: on Hobby, `maxDuration` is 60s, and an hour of
    audio may not transcribe inside that at all. A deployment that needs this
    to work on long sermons wants a plan with a longer function timeout,
    raising `maxDuration` and `BUDGET_MS` together.

### Preview deployments need their own database

Vercel exposes one value per env var to every environment unless you scope
it, so an unscoped `DATABASE_URL`/`POOLED_DATABASE_URL` means **preview builds run
`migrate deploy` against production** — a migration in an unmerged PR would
hit real data before anyone reviewed it.

In Vercel → Settings → Environment Variables:

- Scope the production connection strings to **Production** only.
- Add Preview-scoped values for **both** `DATABASE_URL` and
  `POOLED_DATABASE_URL`, pointing at a separate database. Scoping only one of
  them still leaves the other global — and since `DATABASE_URL` is the one
  migrations run through, leaving *it* global means preview builds migrate
  production.

For Prisma Postgres, create that second database in
[Prisma Console](https://console.prisma.io) or with the Platform CLI:

```bash
npx -y @prisma/cli@latest database create preview --branch main
npx -y @prisma/cli@latest database connection create <database-id>
```

**Get both the pooled and direct connection strings, not just one.** Console
(and the Management API) expose them as two separate values, each shown
**once** at creation — Console labels them by client rather than by pooling,
so match on protocol: **"Prisma ORM"** /
`prisma+postgres://accelerate.prisma-data.net/?api_key=…` is the pooled one
(Accelerate pools by default) and goes in `DATABASE_URL`; **"Any Client"** /
`postgres://…@db.prisma.io:5432/…` is direct and goes in `DATABASE_URL`. See
the datasource comment in `prisma/schema.prisma` for why the split matters.
**Putting the "Any Client" string in `DATABASE_URL` is what produces "too
many connections for role" once real traffic hits it** — that role's
connection cap is sized for a migration's brief burst, not sustained
concurrent serverless traffic, and it will look fine in initial testing
before failing under load.

**Why `DATABASE_URL` holds the *direct* string.** Vercel's Prisma Postgres
marketplace integration provisions one connection string per environment,
binds it to `DATABASE_URL`, and marks it integration-managed — which makes it
read-only in the dashboard: there's no Edit, only "Rotate Integration
Secrets", which reissues the same kind of connection with new credentials.
Marketplace integrations own their variables' credential lifecycle by design,
so that's not a setting to hunt for. What the integration injects is the
direct connection, so rather than fight it, `prisma/schema.prisma` reads it
as `directUrl` — where a direct connection is exactly what's wanted — and
takes the pooled string from `POOLED_DATABASE_URL`, which you add by hand.
Vercel's own Storage note says additional connection strings "must be
manually added as environment variables", so adding one is the supported
path even when editing isn't.

That means the setup on Vercel is: leave `DATABASE_URL` alone, and add
`POOLED_DATABASE_URL` (Settings → Environment Variables → Add New, marked
Sensitive) with the "Prisma ORM" `prisma+postgres://accelerate…` string, once
per environment.

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
