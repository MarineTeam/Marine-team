# Features

A complete list of what's built. See [README.md](./README.md) for setup and
[CHANGELOG.md](./CHANGELOG.md) for release history.

## Public site

- **Browsing** — a vertical list of tiles (thumbnail, title, item count),
  Subsplash-style. Categories nest arbitrarily deep (a category's children
  can themselves have children); the homepage shows top-level categories and
  any uncategorized series, each linking one level deeper.
- **Series & video pages** — description, tags, cover image, video playback
  (embedded Bunny Stream player), file downloads, inline playback for audio
  files.
- **Featured/pinned content** — a series can be marked `featured` (used for
  the homepage hero, overriding the recency-based default) or `pinned`
  (sorts first in its listing regardless of position).
- **Tags** — free-form tags on a series, shown as chips, searchable;
  `/tags/[tag]` lists everything with a given tag.
- **Scheduled publishing** — `publishAt`/`unpublishAt` timestamps on
  series/videos/files gate visibility independently of the `published` flag,
  so content can go live or expire automatically without a manual step.
- **Search** — `/search` and the navbar search box rank results by
  relevance (exact/prefix title match outranks a description-only hit)
  across category names, series titles/descriptions/tags, video
  titles/descriptions, and speaker names. Filters narrow results to one
  category and/or speaker, and a sort toggle switches between relevance and
  newest-first. If the exact pass finds no series or no videos, a
  typo-tolerant fuzzy pass runs as a fallback, ranking by Postgres trigram
  similarity so "chruch" still finds "Church" — see the technical note below.
- **Speakers** — an admin-managed directory of preachers/presenters
  (`/speakers`, `/speakers/[slug]`), attachable to a video from the video
  manager; a speaker's page lists their published, viewable videos.
- **Scripture references** — free-form Bible references on a video (e.g.
  "John 3:16-18"), shown as chips and browsable at `/scripture` (an index of
  referenced books) and `/scripture/[book]`.
- **Live streaming** (plugin) — an admin-scheduled `LiveStream` pointing at
  an already-hosted embed (YouTube, Boxcast, etc. — Bunny Stream has no live
  ingest). `/live` shows the current stream when one is live, a countdown to
  the next scheduled one otherwise, and a site-wide "Live now" banner appears
  on the homepage and in the nav while a stream is live. Publishing a stream
  sends a push notification, same as a new video.
- **Continue watching / recently added** — a periodic heartbeat approximates
  watch position (see note below) and powers a homepage "Continue watching"
  row with resume-from-where-you-left-off; a "Recently added" row shows the
  newest published series.
- **Trending** — a homepage "Trending this week" row of the series with the
  most logged views in the last 7 days (gated by the View counts plugin,
  which now also logs timestamped view events, not just the all-time counter).
- **Admin-configurable homepage rows** — an admin can turn any homepage row
  on/off, rename it, and reorder it, plus add curated rows pointing at a
  specific category or tag. See Admin CMS below.
- **Up next** — a panel under a video showing the next episode in its series,
  with an autoplay toggle (persisted per-browser) that best-effort advances
  once the current video's known duration elapses — see the technical note
  below on why this isn't a real "ended" event.
- **Scheduled premieres** — a video can be marked as a premiere with a future
  publish time: unlike a normal scheduled video (fully hidden until then), a
  premiere's page is visible early with a live countdown to the exact
  publish time, then swaps to the real player automatically.
- **Related content** — series pages show "More like this" (same category,
  then shared tags); video pages show "More from this series" or "You might
  also like" for standalone videos.
- **Sequential unlock** — a per-series "require watching in order" toggle
  locks a video until the previous one (by position) is marked completed in
  the viewer's watch history. Anonymous viewers are never locked out (no
  progress tracking without an account).
- **Feeds** — `/feed.xml` (site-wide RSS of recently added series) and
  `/series/[slug]/podcast.xml` (iTunes-compatible podcast feed of a series'
  audio files, skipped for member-only series since podcast apps can't
  authenticate).
- **Sitemap** — `/sitemap.xml` lists published categories and series,
  guest-visible videos, and every distinct series tag, so search engines
  don't have to discover pages by crawling links alone. Member-only videos
  are left out (as in every public video listing); member-only categories
  and series are included, matching how they already list publicly behind a
  "Members" badge.
- **PWA** — installable (Add to Home Screen / desktop install prompt) with
  a minimal service worker; see the PWA section below.

## Member features (optional plugins — see Plugins below)

- **Favorites** (`/favorites`) — bookmark a series or video.
- **Watch later** (`/watch-later`) — a separate queue from Favorites.
- **Comments** — discuss a series or video, one level of replies deep;
  authors can delete their own comments and replies, moderators can delete
  any (see Permissions). Any other logged-in member can **report** a
  comment; reported (and moderator-hidden) comments surface in the
  `/admin/comments` moderation queue, where a moderator can hide (without
  deleting) or delete them — see Admin CMS below.
- **Ratings** — a 1-5 star rating on a series or video; average and count
  shown to everyone, the stars are only clickable when logged in.
- **View counts** — a simple counter shown on series/video pages.
- **Social share** — copy-link and share-to-X/Facebook buttons.
- **Announcements** — a dismissible (per browser session) site-wide banner,
  optionally scheduled (start/expiry time) and targeted to guests, members,
  or everyone.
- **Notifications** — opt-in Web Push, sent when an admin publishes a video.
  Each member picks a frequency on `/profile`: **Instant** (the default)
  pushes the moment content publishes, **Daily digest** queues notifications
  and delivers one batched push a day via a scheduled job. The selector only
  appears while this plugin is on. A member can also opt into an **email**
  copy of the same notifications — a separate, always-instant channel
  (independent of the push frequency choice) that reaches members without a
  push subscription at all; see the technical note below.
- **Subscriptions** (`/subscriptions`) — follow a series or category; when a
  followed series publishes a new video, its subscribers get a push
  notification (in addition to, and independent from, the general
  Notifications plugin above). Each subscription has a mute toggle that
  keeps the follow but skips push notifications for it.
- **Playlists** (`/playlists`) — member-created, ordered, reorderable video
  collections, separate from the single site-wide Watch Later queue. A
  playlist can be made shareable ("Make shareable"), which lets anyone with
  the link view it read-only at `/playlists/[id]` without logging in —
  otherwise it's only visible to its owner.
- **Likes / dislikes** — a thumbs up/down on a series or video, shown
  alongside (and independent from) the 1-5 star Ratings plugin.
- **Watch history** — gates the `/recently-played` page and its bottom-nav
  tab, matching the toggle pattern of the other member features.
- **Profiles** — lets a member set a display name, shown instead of their
  Auth0 account name in comments and the navbar. Blank falls back to the
  Auth0 name, then the email. The field lives on `/profile/settings`; the
  profile area itself is always available (see The profile area below), since
  it also holds the inbox, shared links, and account settings.
- **Share links** — lets a member create a revocable link to a series or
  video, either public or emailed to named people. See Share links below.
- **Chapters** — an admin-managed, ordered list of named timestamps on a
  video; the video page shows a jump-to-section list underneath the player.
  Clicking a chapter reloads the embed starting at that timestamp (Bunny's
  iframe has no seek API — see the technical note below).
- **Transcripts** — an admin-pasted full-text transcript per video, shown in
  a collapsible panel; when this plugin is on, `/search` also matches
  against transcript text (weighted below a title/description match).
- **Recommendations** — a homepage "Because you watched X" row for logged-in
  members, anchored on the series of their most recently watched video and
  reusing the same same-category/shared-tag logic as related content.
- **Sermon notes** — a member's own private, timestamped notes on a video
  (e.g. "12:03 — great point about grace"), added while watching and
  exportable as a plain text file. The timestamp is manually entered, the
  same limitation as Chapters (see the technical note below).

## Watch progress extras

- **Mark as watched** — a manual toggle on the video page sets or clears
  `WatchProgress.completed` directly, independent of the heartbeat
  approximation — useful when a member watched elsewhere, or the heartbeat
  missed the very end. Affects the same completion flag that gates
  sequential unlock and feeds the watch-through-rate analytics.

## The profile area (`/profile`)

One account area, the same on the web and in the installed PWA, reachable
from the navbar and from a **Profile** tab in the mobile bottom nav (with an
unread badge). Five sections:

- **Overview** — what's waiting: unread count, active shared links, and
  shortcuts into favorites/playlists/watch later/recently played.
- **Inbox** (`/profile/inbox`) — every notification the site has sent this
  member, kept as `Notification` rows written alongside each push/email send.
  It fills up whether or not push was ever allowed, so it works as the
  catch-up record on a device that never got the notification: mark one or
  all read, open the linked content, delete individually or clear the lot.
  The push permission toggle sits at the top of this page.
- **Shared links** (`/profile/shared-links`) — every link this member has
  handed out, with its status, recipients, open count, and a Revoke button.
- **Downloads** (`/profile/downloads`) — the Wi-Fi-only vs Wi-Fi-or-mobile-data
  preference (stored per device, live now) and a placeholder download list;
  offline playback itself is still to come.
- **Settings** (`/profile/settings`) — two groups, in this order:
  - **This device** (localStorage, works logged out, differs per device):
    **Theme** (System/Light/Dark), **Language** (English only for now, the
    selector is disabled), **Autoplay**, and **Default playback speed**.
  - **Account** (applies wherever they log in): display name (Profiles
    plugin), notification frequency and email opt-in (Notifications plugin),
    and **Delete account**.

Notes on the device settings:

- **Theme** is a `dark`/`light` class on `<html>`, stamped by a blocking
  inline script (`THEME_INIT_SCRIPT`) before first paint so the page never
  flashes the wrong theme; a `ThemeSync` client component keeps "System"
  following the OS while the page is open, and picks up changes made in
  another tab. Tailwind's `dark:` variant is redefined to key off that class
  (`@custom-variant` in `globals.css`), with the old `prefers-color-scheme`
  media query kept as a no-JS fallback.
- **Autoplay** genuinely starts the video and drives the "Up next" roll-on —
  the toggle in the Up next panel is the same preference, not a second one.
- **Default playback speed** is stored and shown as a reminder under the
  player, but can't be applied automatically: Bunny's embed takes no
  playback-rate parameter and exposes no postMessage API, the same limitation
  as chapters and watch progress (see the technical notes).
- **Delete account** requires typing the account's own email address, then
  hard-deletes the `User` row — every relation cascades (comments, notes,
  playlists, favorites, watch progress, push subscriptions, share links they
  created) and the browser is sent to `/auth/logout`. The only trace left is
  the audit-log entry, which stores an email rather than a foreign key. The
  last remaining admin is refused, since that would leave nobody able to
  grant access again.

## Share links

A revocable, tracked link to one series or video, opened at `/s/[token]`.
Unlike copying the page URL, the sharer keeps a list of what they've handed
out, sees how often each link has been opened, and can switch any of them off.

- **Who can share.** Two tiers, enforced in `shareLinkPolicy`:
  - Content that is already public to anyone: **any logged-in member** can
    share it (with the Share links plugin on). The link grants nothing the
    recipient didn't already have — it's a tracked, revocable link.
  - Content that is gated (`memberOnly`, or restricted to viewer
    groups/users): only an **admin** or someone holding the new
    **`share_content`** capability can share it, and their link carries a
    real access grant. The capability can be granted site-wide or scoped to
    a category/series, so a group can be given sharing rights over just
    their own section.
- **Public vs private.** A public link opens for anyone holding it, logged in
  or not. A private link is addressed to specific emails: each recipient is
  emailed their link (and gets an inbox notification if they already have an
  account), and opening it requires being logged in as that address — so
  forwarding it on doesn't hand over access.
- **How the grant works.** `/s/[token]` validates the link, records the open,
  and stores the token in an httpOnly `share_access` cookie before
  redirecting to the content — so the recipient keeps access as they browse
  the rest of the series instead of losing it on the first click. The cookie
  holds tokens only, never a grant: every request re-checks each one against
  the DB (revoked? expired? right recipient?), so a revoke takes effect
  immediately even for a browser that already holds the link.
  `canViewSeries`/`canViewVideo`/`getViewableVideoIds` consult the resolved
  grants first, which is also what makes a shared link work for someone with
  no account at all.
- **Where to share.** A "Share a link" panel on any series/video page the
  member is allowed to share, which also lists their existing links for that
  content. `/admin/share-links` (visible to admins and `share_content`
  holders) lists **every** link on the site with its owner, filters by
  active/revoked, revokes any of them (audited), and can create a link for
  any series or video without navigating to its page.
- **Expiry and revocation.** Optional expiry of 1–365 days; revoking sets
  `revokedAt` rather than deleting the row, so a dead link stays visible in
  both lists. Recipients of a link that no longer works land on
  `/share/unavailable`, which says specifically whether it was revoked,
  expired, or meant for another account.
- **Limits.** Only published, visible content can be shared (an unpublished
  or trashed item wouldn't resolve on its own page either). Members are
  capped at 20 new links an hour. Withdrawing someone's `share_content`
  capability does **not** retroactively kill links they already created —
  that's what the admin list and its Revoke button are for.

## Auth

- Auth0 login (`/auth/login`, `/auth/logout`, `/auth/callback`) proves
  identity only — it does not grant access by itself. Every login attempt
  creates a `User` row; `authorized` starts `false` and must be granted by
  an admin (or pre-authorized before the person ever logs in) before
  they're treated as logged in anywhere else on the site.
- Emails listed in `ADMIN_EMAILS` self-authorize as `ADMIN` on first login,
  so there's always a way in.

## Admin CMS (`/admin`)

- **Content management** — categories (with drag/position/type-to-reorder),
  series, videos (direct upload via TUS + import from an existing Bunny
  Stream library), and files (small uploads or link-by-URL for larger
  files hosted directly in Bunny).
- **Bulk actions & filtering** — multi-select Publish/Unpublish/Delete and
  a title filter box on the series/video/file lists; series can be
  recategorized individually or in bulk. "Schedule publish…" sets a
  future `publishAt` across the whole selection in one prompt.
- **Audit log** (`/admin/audit`) — an append-only record of admin/editor
  actions, exportable as CSV or JSON.
- **Plugins** (`/admin/plugins`) — a WordPress-style list of the optional
  member features above, each with a site-wide Active/Inactive toggle plus
  per-category overrides (nearest-ancestor override wins, falls back to the
  site-wide default) — e.g. disable Comments just under "Kids".
- **Permissions** (`/admin/permissions`) — a phpBB/WordPress-style builder:
  define named groups as a custom bundle of capabilities (manage
  categories/series/videos/files, publish content, moderate comments,
  manage users/permissions/plugins, view audit log), then assign a group to
  a user site-wide or scoped to one category (and everything under it) or
  one series. This sits alongside a simpler built-in per-category/series
  "content-editor" grant in `/admin/users`. The real `ADMIN` role always has
  every capability and can only be granted by another `ADMIN` — a custom
  "manage_users" group can't be used to self-promote.
- **Granular viewing permissions**: a series or video's edit page can
  restrict viewing to specific permission groups ("roles") and/or specific
  people by email, layered on top of the plain "Members only" checkbox. As
  soon as any such grant exists for an item, "Members only" no longer gates
  it — only the granted roles/people (and admins) can view it. Files aren't
  covered — they stay governed by their own "Members only" flag.
- **Draft mode for series edits**: a series' edit page has a "Save as draft"
  action alongside "Publish now" — it stages the form's field values in a
  single pending `DraftRevision` row (upserted, not versioned) without
  touching the live series. A banner shows the pending draft with "Load
  into form" and "Discard" actions; publishing clears any staged draft.
  Scoped to series only — videos are edited inline in the video list rather
  than through a comparable multi-field form.
- **Hide content**: a series, video, or file can be marked `hidden` from its
  admin edit page, independent of `published`/`memberOnly`. Hidden content is
  excluded from every guest- and member-facing listing, search, RSS/podcast
  feed, and direct URL — it behaves like it doesn't exist for anyone except
  admins/editors managing it in `/admin`.
- **Member content hidden from guests by default**: `memberOnly` series and
  videos are excluded outright from all public listings (homepage, category
  pages, search, trending, related/up-next, RSS) for anyone not logged in —
  a guest browsing the site never sees that the content exists. Logged-in
  members see it normally. Visiting a member-only item's URL directly still
  shows a "log in to view" gate rather than a 404, so a shared link still
  invites sign-up.

- **Closed captions** — a "Captions" button on each row of the video list
  opens a panel for uploading a `.vtt`/`.srt` track (1MB cap), labelled by
  language code, and removing tracks later. Not a plugin and not stored
  locally: tracks live in Bunny Stream, keyed by `srclang`, and its embed
  player shows a CC toggle automatically once one exists. Distinct from the
  Transcripts plugin, which is a searchable text panel beside the video
  rather than subtitles on it.

- **Comment moderation** (`/admin/comments`, needs `moderate_comments`) — a
  queue of every reported and/or hidden comment, scoped to a moderator's own
  categories/series unless they hold a site-wide `moderate_comments` grant
  (or are `ADMIN`). "Hide" removes a comment from public view without
  deleting it; "Delete" is permanent, same as the existing per-comment
  delete action.

- **Share links** (`/admin/share-links`, needs `share_content`) — every share
  link on the site, whoever created it: target, owner, public or private,
  recipients, whether it grants access, open count, and a Revoke button
  (audited). Filterable by active vs revoked/expired, and can create a link
  for any series or video from a picker. See Share links above.

- **Homepage rows** (`/admin/home-rows`, needs `manage_plugins`) — turn any
  of the homepage's built-in rows (Continue watching, Because you watched,
  Trending, Recently added) on/off and rename them, plus add curated rows
  pointing at a specific category or tag. Continue watching (when shown)
  always renders directly above the category/series browse list, which
  itself isn't reorderable; every other row reorders and appears below it,
  in the order configured here.

- **Webhooks** (`/admin/webhooks`) — admin-configured outgoing URLs that get
  a JSON POST whenever a series or video is published; optionally signed
  with a secret as an `X-Webhook-Signature` header (hex HMAC-SHA256). Needs
  the Webhooks plugin enabled in Plugins.

- **Trash** (`/admin/trash`) — deleting a category, series, video, or file
  moves it to trash instead of removing it, so a mistake is recoverable.
  Restore brings it back exactly as it was; permanent delete is
  irreversible and, for a video/file, is also the point its underlying
  Bunny Stream/Storage asset actually gets removed — trashing alone leaves
  it in place. Requires holding at least one of the four content-management
  capabilities (`manage_categories`/`series`/`videos`/`files`) site-wide, or
  being `ADMIN`; see the technical note below on what trashing a category or
  series does (and doesn't do) to what's inside it.

- **Slug aliases** — renaming a series or video's slug from its edit page
  records the old slug, so a link shared before the rename 301s to the
  current one instead of 404ing, automatically.

## Admin analytics (`/admin/analytics`)

- Needs the `view_analytics` capability. Shows total views over a selectable
  window (7/30/90 days, `?days=`) plus the top 10 series and top 10 videos
  by view count in that window, built from the same timestamped view log
  that powers the homepage Trending row.
- Each top video also shows a **watch-through rate**: the share of that
  window's watch-progress rows for the video that are marked completed.
  It reuses the existing heartbeat data rather than adding tracking, and is
  omitted entirely (not shown as 0%) for a video with no progress recorded
  in the window, so a stale view count can't be paired with a misleadingly
  precise 0%.
- **Export CSV** downloads the same top-series/top-videos data for the
  selected window as a CSV (or JSON) file, for pulling into a spreadsheet or
  a board report.

## Scheduled jobs

- `/api/cron/notification-digest` (daily): batches queued daily-digest push
  notifications — see Notifications above.
- `/api/cron/sync-video-status` (daily): polls Bunny for every video still
  stuck in `PROCESSING` and applies the same status/duration/thumbnail
  update the admin's manual "Sync from Bunny" button does, so a video that
  finished encoding doesn't sit unprocessed until someone happens to click
  refresh. Never touches `published` — an admin still decides when to
  publish. Both crons share the same `CRON_SECRET` bearer-token guard.

## Query Monitor (`QUERY_MONITOR_ENABLED` env var)

- A WordPress-Query-Monitor-style debug bar, fixed to the bottom of every
  page: request elapsed time, the number of Prisma queries run and their
  total time, a per-query breakdown (model.operation, a truncated args
  preview, duration), and process memory (heap/RSS).
- Two switches gate it, both required:
  - The `QUERY_MONITOR_ENABLED` environment variable (must be `"true"`,
    case-insensitive — `TRUE`/`True` work too; anything else, including
    unset, is off) — the deploy-level kill switch, matching WordPress's
    `WP_DEBUG` rather than a database-toggled `Plugin`. Flipping it requires
    a redeploy; `/admin/query-monitor` can only report its current value.
  - A DB-backed admin switch, toggleable right on `/admin/query-monitor`
    (`manage_plugins` capability) with no redeploy needed — e.g. to hide the
    bar during a live demo and bring it back a minute later. Stored as a
    `Plugin` row with slug `"query-monitor"` (`QUERY_MONITOR_ADMIN_SLUG` in
    `src/lib/query-monitor.ts`) reusing the existing table/shape, but
    deliberately left out of `PLUGIN_META` — it's an ops tool with no
    per-category meaning, so it doesn't appear on `/admin/plugins` or get a
    "Category overrides" control (`/api/admin/plugins` explicitly filters to
    `PLUGIN_META`'s own slugs to keep it out). Defaults to on (fails open)
    the first time, so setting the env var alone is enough to see the bar
    without a trip to this page first.
- Even when both switches are on, the bar only renders for logged-in
  `ADMIN` users — query text/args and timings can hint at internal schema
  and data shape, so (unlike WordPress's Query Monitor, which is itself
  also capability-gated) it's never shown to members or guests regardless
  of either switch.
- Query capture is a Prisma Client Extension (`src/lib/db.ts`) wrapping
  every model operation; it's a no-op passthrough unless the env flag is
  on — checking the admin switch too would mean a DB read on every single
  query, so recording is gated on the env flag alone and the admin switch
  only affects whether the bar renders. The per-request tally
  (`src/lib/query-monitor.ts`) uses React's `cache()` — the same
  request-scoping primitive `getCurrentUser()` already relies on — so
  concurrent requests never mix each other's counts. Raw `$queryRaw`/
  `$executeRaw` calls (e.g. `categoryChainIds`) aren't model operations, so
  they aren't captured by this instrumentation.
- Next.js's App Router reuses the root layout's previous render across
  client-side (`<Link>`) navigations rather than re-executing it — "partial
  rendering" — so without help the bar would keep showing whichever page
  triggered the last full/hard load. `QueryMonitorRefresher`
  (`src/components/query-monitor-refresher.tsx`), rendered alongside the
  bar, forces a `router.refresh()` on every path change so the layout (and
  the bar with it) recomputes against each page's own request. Only mounted
  when the bar itself is — i.e. never for anyone but an enabled-and-`ADMIN`
  viewer — so it costs nothing for ordinary visitors.

## Technical notes

- **Watch progress** is a heartbeat-based approximation, not frame-accurate:
  Bunny's Stream iframe embed has no documented postMessage API for exact
  play/pause/seek events, so progress is inferred from elapsed time while
  the page is open rather than a precise scrub position.
- **Up next autoplay** has the same limitation: there's no "video ended"
  event to hook, so autoplay fires a timer based on the video's known
  duration rather than a real end-of-playback signal.
- **Chapters** have the same root cause too: since the embed has no seek
  API, clicking a chapter reloads the iframe with a new `t=` start-time
  query param instead of seeking a live player.
- **Sermon notes'** timestamp field is manually entered for the same
  reason (no real playback position to read) — it's prefilled once from the
  heartbeat's elapsed-time approximation as a starting point to adjust from,
  not kept in sync afterward.
- **The heartbeat never un-marks a video as watched**: `/api/watch-progress`
  only ever sets `completed` to `true`, never back to `false` — a stray
  heartbeat reporting `false` (e.g. re-opening a finished video partway
  through) must not silently clear a completion that "Mark as watched" or an
  earlier heartbeat already recorded. Un-marking is only ever a deliberate
  action, via the mark-as-watched toggle or `/api/watch-progress/mark-watched`.
- **Trashing a category or series doesn't cascade to what's inside it**: its
  own row gets `deletedAt` set, but a child series/video/file keeps its
  existing `categoryId`/`seriesId` untouched — it just stops appearing
  anywhere the trashed parent would have listed it (the category/series
  browse tree), while still being directly reachable by its own URL. This is
  a deliberate scope trim for the first version of trash rather than full
  recursive soft-delete/restore.
- **View counts** are a simple per-page-load counter, not deduplicated or
  spam-resistant — a basic "how many hits" number, not analytics. Trending
  and the admin analytics dashboard use a separate timestamped view log for
  the same reason (recency-windowed counts need timestamps, the simple
  counter doesn't have any).
- **Playback speed** is handled by Bunny Stream's own player UI (the ⚙️
  settings icon) — there's nothing to build server-side since the iframe
  embed already exposes it.
- **Fuzzy search is a fallback, not the default path**: the exact/substring
  query runs first and, when it matches anything, nothing else happens — so
  the common case pays no extra query. Only when a pass comes back empty
  does the fuzzy path run, ranking candidates by Postgres trigram similarity
  (`similarity()`, via the `pg_trgm` extension and GIN indexes added in the
  `search_trigram_indexes` migration) rather than pulling rows into memory —
  this scales with the database, not with an in-memory row cap.
- **Closed captions live in Bunny, not here**: there's no local copy and no
  new `Video` column — the admin route reads and writes Bunny's captions
  API directly, so every render path picks up a new track for free, the
  same pattern the custom-thumbnail work uses. Bunny is the source of truth,
  which also means the captions panel reflects whatever is set there even if
  it was uploaded from the Bunny dashboard.
- **Daily digests need a scheduled job**: a member set to "Daily digest"
  never gets an inline push — each notification is queued as a
  `PendingNotification` row and only leaves the system when
  `/api/cron/notification-digest` runs (scheduled in `vercel.json`, daily).
  Without that cron running, digest users' notifications accumulate and are
  never delivered. The route is guarded by `CRON_SECRET` when that env var
  is set, so it can't be hit externally to mass-send pushes.
- **Rate limiting**: comments (5/minute), ratings, and likes/dislikes
  (20/minute each) are capped per logged-in user via a DB-backed count over
  a rolling window (`src/lib/rate-limit.ts`), returning 429 once exceeded.
  `/api/view-events` isn't covered by this — see its own cookie-based
  throttle below, kept separate since it's unauthenticated and specifically
  designed to avoid a DB read/write per view.
- **ViewEvent writes are throttled per browser per item** (`/api/view-events`,
  fired client-side by `ViewEventBeacon`) using a 30-minute cookie rather
  than a DB check: a cookie read is free, so a throttled repeat view costs
  zero database operations, instead of trading a write for a read (which
  wouldn't actually save anything, since reads are billed too on a
  Postgres free tier). The plain `viewCount` counter is unaffected and
  still increments on every view like before.
- **The PWA service worker** deliberately does not cache pages or API
  responses. This site's content is dynamic and often member-gated, so an
  aggressive offline cache would risk showing stale or wrong-audience
  content; it only caches its own static shell (manifest + icons) and
  handles push notifications.
- **Email notifications are a fetch to the Resend API** (`src/lib/email.ts`),
  the same pattern as `bunny.ts`/`webhooks.ts` talking to their own REST
  APIs — no SDK dependency. It's a no-op if `RESEND_API_KEY`/`EMAIL_FROM`
  aren't set, same as push's VAPID-keys-optional behavior. Unlike push,
  email always sends immediately: it isn't queued into `PendingNotification`
  for `DAILY` users, since that preference only governs push's timing.
- **The trigram GIN indexes have no `schema.prisma` representation** (raw
  SQL migration, not the Prisma DSL) — the next `prisma migrate dev` will
  read them as drift and propose dropping them. Strip any such
  `DROP INDEX ..._trgm_idx` statements from a freshly generated migration
  before applying it (see the `home_rows_comment_moderation_email`
  migration for an example of this already happening once).

## Tests & CI

`npm test` runs a vitest suite (`src/lib/*.test.ts`) over the logic that
would fail quietly rather than loudly — access and capability checks,
plugin override precedence, sequential unlock, list reordering, fuzzy
matching, share-link sharing rules and link validity, and device-settings
parsing. Prisma is mocked, so the suite needs no database.

GitHub Actions runs the type check, lint, that suite, and
`prisma validate` / `prisma format --check` on every pull request and every
push to `main` (`.github/workflows/ci.yml`). The schema check is why an
unformatted `schema.prisma` fails CI — run `npx prisma format` before
committing schema edits.
