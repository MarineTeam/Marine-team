# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Speakers**: an admin-managed directory of preachers/presenters
  (`/admin/speakers`), attachable to a video from the video manager.
  `/speakers` and `/speakers/[slug]` list them alongside their published,
  viewable videos.
- **Scripture references**: free-form Bible references on a video (e.g.
  "John 3:16-18"), edited from a new "Scripture" panel in the video manager
  and browsable at `/scripture` (an index of referenced books) and
  `/scripture/[book]`.
- **Live streaming plugin** (`/admin/live`): schedule a live stream that
  points at an existing embed (YouTube, Boxcast, etc.). `/live` shows the
  current stream while it's live, a countdown to the next scheduled one
  otherwise, and a "Live now" banner appears on the homepage and in the nav.
  Publishing a stream sends a push notification like publishing a video does.
- **Search filters + sort**: `/search` gained category and speaker filters
  plus a relevance/newest sort toggle, and now also matches on speaker name.
- **Trigram-backed search**: the fuzzy fallback in `/search` (and the typo
  tolerance it provides) now ranks candidates by Postgres trigram similarity
  (`pg_trgm`, new GIN indexes) instead of scanning up to 500 rows into
  memory with a JS Levenshtein matcher, which is retired along with it.
- **Admin-configurable homepage rows** (`/admin/home-rows`): toggle, rename,
  and reorder the homepage's built-in rows (Continue watching, Because you
  watched, Trending, Recently added), and add curated rows pointing at a
  specific category or tag.
- **Comment reporting + moderation queue**: any logged-in member can report
  a comment; reported (and moderator-hidden) comments surface in a new
  `/admin/comments` queue, scoped to a moderator's own categories/series
  unless they hold a site-wide `moderate_comments` grant. A moderator can
  hide a comment (removed from public view, not deleted) or delete it as before.
- **Email notification channel**: members can opt into an email copy of
  their notifications on `/profile`, sent via the Resend API alongside Web
  Push. Always instant, independent of the existing instant/daily-digest
  choice (which only governs push timing).
- **Sermon notes**: a member's own private, timestamped notes on a video,
  added from a panel on the video page and exportable as a text file.
- **Trash + restore** (`/admin/trash`): deleting a category, series, video,
  or file now moves it to trash instead of removing it immediately.
  Restore brings it back exactly as it was; permanent delete is
  irreversible and, for a video/file, is the point its Bunny Stream/Storage
  asset is actually removed.
- **Slug aliases**: renaming a series or video's slug now records the old
  one, so a link shared before the rename redirects to the current slug
  instead of 404ing.
- **Manual "Mark as watched"**: a toggle on the video page sets/clears
  watch completion directly, independent of the heartbeat approximation.

### Fixed

- **Watch progress no longer silently un-marks a video as watched**: a
  heartbeat reporting incomplete (e.g. re-opening a finished video partway
  through) used to overwrite an existing `completed: true`, which could
  re-lock a sequential-unlock series and drop the video from the
  watch-through-rate analytics. The heartbeat now only ever sets `completed`
  forward to `true`, never back to `false`.

## [1.3.0] - 2026-07-29

### Added

- **Watch history plugin**: the `/recently-played` page and its bottom-nav
  tab are now gated by a new "Watch history" plugin toggle, matching every
  other optional member feature.
- **Comment replies**: comments now support one level of threaded replies.
  A reply to a reply attaches to that reply's top-level parent instead of
  nesting further.
- **Profiles plugin** (`/profile`): members can set a display name shown
  instead of their Auth0 account name in comments and the navbar.
- **Chapters plugin**: admins can add named timestamps to a video from the
  video manager; the video page shows a clickable chapter list underneath
  the player.
- **Transcripts plugin**: admins can paste a full-text transcript per video,
  shown in a collapsible panel and matched by `/search` when the plugin is on.
- **Recommendations plugin**: a personalized "Because you watched X"
  homepage row for logged-in members.
- **Webhooks plugin** (`/admin/webhooks`): admins can register outgoing URLs
  that get a signed JSON POST when a series or video is published.
- **Subscription mute**: each entry on `/subscriptions` has a mute toggle
  that keeps the follow but skips push notifications for it.
- **Bulk schedule publish**: the series/video/file admin lists gained a
  "Schedule publish…" bulk action, setting a future `publishAt` across the
  whole selection in one prompt instead of one item at a time.
- **Draft mode for series edits**: "Save as draft" stages a series edit
  form's values without publishing; a banner offers "Load into form" /
  "Discard" for the pending draft.
- **Rate limiting**: comments, ratings, and likes/dislikes now return 429
  once a logged-in user exceeds a per-minute cap, via a DB-backed rolling
  count rather than an in-memory limiter (this app runs on serverless
  functions with no shared process state).
- **Sitemap** (`/sitemap.xml`): published categories and series, guest-visible
  videos, and every distinct series tag, so search engines don't have to
  discover pages by crawling links alone.
- **Notification frequency**: `/profile` gained an instant-vs-daily-digest
  choice for push notifications. "Instant" (the default, unchanged for
  everyone) sends on publish; "Daily digest" queues each notification and a
  scheduled job batches them into one push a day.
- **Closed captions**: the video manager gained a "Captions" panel for
  uploading a `.vtt`/`.srt` track per language and removing it later. Tracks
  live in Bunny Stream, whose player then shows a CC toggle automatically.
- **Watch-through rate**: `/admin/analytics` now shows, per top video, the
  share of the window's viewers who reached the end — derived from the
  existing watch-progress heartbeats, with no new tracking.
- **Typo-tolerant search**: `/search` now falls back to a fuzzy (edit
  distance) title match when the exact/substring pass returns nothing, so a
  single typo no longer yields an empty page.
- **Mobile bottom tab bar**: Home, Recently Played, Favourites, and Recently
  Added as a persistent bottom nav, alongside a redesigned mobile header.

### Changed

- **Renamed to Marine Team**: the app name now reads "Marine Team" across the
  PWA manifest, page title, navbar, footer, homepage heading, RSS feed, and
  the push-notification fallback title, with a new play-mark-over-a-wave icon
  set — committed SVG sources, a separate full-bleed maskable variant, a real
  `favicon.ico`, and an apple-touch icon.
- **Tracked database migrations**: deploys run `prisma migrate deploy` against
  a committed migration history (baselined by `0_init`) instead of
  `prisma db push`, so a schema change is reviewable and can't silently fail
  against populated tables. `db:migrate` / `db:deploy` / `db:baseline` scripts
  wrap the workflow.
- **Categories at parity with series**: categories can hold videos and files
  directly without an intermediate series, gained the same descriptive and
  publishing fields, and member-only or empty categories are now listed for
  guests with a "Members" badge instead of being omitted.
- **Optimized thumbnails**: Bunny Stream and Storage images render through
  `next/image` (resizing, lazy loading, format negotiation); freeform
  admin-pasted cover URLs stay unoptimized rather than opening
  `remotePatterns` to any host.
- **Fewer database queries per page**: shared listing queries (homepage,
  hero, recently added, upcoming premieres, trending, announcement banner)
  are cached with tag invalidation on admin writes, the recursive category
  chain lookup is deduped into one query, and bulk publish/unpublish/delete
  run as a single request instead of one per selected row.

### Removed

- **`Video.thumbnailUrl`**: the column stored a 6-hour-expiring signed URL
  permanently and has had no readers since every render path started building
  a fresh URL at request time.

### Fixed

- **Bunny thumbnails 403ing**: thumbnail URLs were signed with the embed
  player's video-id-keyed token scheme; they are served off the Stream
  library's CDN pull zone, which needs the path-keyed BunnyCDN scheme.
- **Malformed file download URLs**: CDN hostname env vars are normalized
  (protocol and stray slashes stripped), and file URLs are computed fresh
  from the stored Bunny path rather than a stored URL, self-healing existing
  uploads. Podcast `<guid>` no longer tracks the enclosure URL, so a hostname
  change stops re-announcing old episodes.
- **Category edit permissions**: a per-category editor grant no longer
  mismatches the capability checked by the category edit page.
- **Mobile menu**: renders full screen instead of inside the header's box,
  and is reachable and dismissable from the keyboard.
- **View counts on gated series**: a signed-out visitor who only saw the
  members-only gate no longer counts as a view.

### Security

- **API errors no longer leak internals**: responses returned `error.message`
  verbatim with a 400 for every thrown value, exposing Bunny response bodies,
  Prisma query text, and env var names. Detail is now returned only for
  errors about the caller's own request (Zod field issues, Prisma `P2025` →
  404, `P2002` → 409, `P2003` → 400); anything else is logged server-side and
  answered with a generic 500.

### Development

- **Unit tests** (`npm test`): a vitest suite covering the pure and
  query-shaping logic most likely to break silently — access checks,
  capability resolution, plugin override precedence, sequential unlock,
  list reordering, and fuzzy matching.
- **CI**: a GitHub Actions workflow running the type check, lint, unit
  tests, and `prisma validate` / `prisma format --check` on every pull
  request and every push to `main`.
- **Migrations workflow documented**: README covers creating and applying
  migrations and keeping per-environment databases in step.

## [1.2.0] - 2026-07-25

### Added

- **Hide content**: a series, video, or file can be marked `hidden` from its
  admin edit page, independent of `published`/`memberOnly`. Hidden content is
  excluded from every guest- and member-facing listing, search, RSS/podcast
  feed, and direct URL — it behaves like it doesn't exist for anyone except
  admins/editors managing it in `/admin`.

### Changed

- **Member content hidden from guests by default**: `memberOnly` series and
  videos are excluded outright from all public listings (homepage, category
  pages, search, trending, related/up-next, RSS) for anyone not logged in —
  a guest browsing the site never sees that the content exists. Logged-in
  members see it normally. Visiting a member-only item's URL directly still
  shows a "log in to view" gate rather than a 404, so a shared link still
  invites sign-up.

## [1.1.0] - 2026-07-25

### Added

- **Subscriptions** (`/subscriptions`): follow a series or category and get
  push notifications when it publishes.
- **Playlists** (`/playlists`): member-created, reorderable video playlists.
- **Likes / dislikes**: thumbs up/down on a series or video.
- **Trending row** on the homepage, from a new timestamped view log.
- **Up next** panel on video pages with an autoplay toggle.
- **Scheduled premieres**: a video can show a live countdown before its
  publish time instead of staying fully hidden.
- **Admin analytics** (`/admin/analytics`, `view_analytics` capability):
  30-day view totals plus top series/videos.
- **Granular viewing permissions**: a series or video can be restricted to
  specific permission groups ("roles") and/or specific people by email,
  instead of just the "Members only" on/off switch. Managed from a new
  "Restricted viewing" panel on the series edit page and a "Viewers" button
  per video.
- A note on playback speed: it's already available via Bunny Stream's own
  player settings, so no custom control was needed.

### Changed

Database query reduction pass (Prisma free-tier operation budget):

- Fixed an N+1 where the series page checked viewer-access permissions
  once per video (up to 4 queries each); now batched into a single set of
  queries regardless of episode count.
- `ViewEvent` writes (Trending/Analytics) are now throttled per browser
  per item via a 30-minute cookie, moved to a client-side beacon instead
  of an inline write on every page render, to cut Prisma operation volume.
- `getCurrentUser()`/`getSessionIdentity()` are now wrapped in React's
  `cache()` so the ~30 call sites that each need the current user (Navbar
  on every page, every page itself, admin layout, ...) share one query per
  request instead of hitting the DB 2-3x. `getCurrentUser()` also dropped
  a redundant `findUnique` before its `upsert` — down to 1 query from 2.
  Combined, this cuts the per-request auth cost by roughly 4-6x.
- Plugin checks: a video/series page used to call `isPluginEnabled()` once
  per plugin (11 calls on a video page), each doing its own plugin lookup,
  category-chain walk (1 query per tree level), and override lookup. New
  `getPluginStates()` resolves every plugin's state for a page in 2-3
  queries total, reused across all of them.
- Fixed a pre-existing N+1 in the series page's "require watching in
  order" check: it looked up the same series row and re-derived "the
  previous video" from the DB for every video in the series (up to 3
  queries each). Since the series page already has the ordered video
  list, `getSequentialLockedVideoIds()` resolves the whole series in a
  single `WatchProgress` query.
- `StarRating`/`ReactionButtons` no longer self-fetch their summary on
  mount (an extra round-trip + queries per page load); the series/video
  pages now compute that server-side, alongside the plugin/ratings/
  reactions data they're already fetching, and pass it down as initial
  props — matching the pattern already used by Favorite/WatchLater/
  Subscribe buttons.
- `CommentSection` no longer self-fetches its comment list on mount either;
  the series/video pages prefetch it server-side (only when the Comments
  plugin is on) and pass it down. `getComments()` is now shared between the
  page and the `/api/comments` GET route instead of duplicated.
- Related-content, comment, and up-next lookups on the series/video pages
  are now conditional on their plugin actually being on (and, for series,
  on the series not being member-gated) instead of running unconditionally
  and only being hidden in the UI.

## [1.0.0] - 2026-07-25

Initial release. See [FEATURES.md](./FEATURES.md) for the full feature list.

### Added

- Auth0 login with a pre-authorization gate (identity ≠ access): every login
  attempt is recorded, and an admin must grant access (or pre-authorize an
  email) before someone is treated as logged in.
- Admin CMS for categories (arbitrarily deep nesting), series, videos, and
  files, backed by Prisma + PostgreSQL.
- Video upload via direct-to-Bunny-Stream TUS resumable uploads, plus import
  of videos already in a Bunny Stream library.
- File uploads to Bunny Storage (or link-by-URL for larger files).
- Bunny Stream Token Authentication support for signed embed/thumbnail URLs.
- Homepage redesigned as a vertical tile menu (thumbnail, title, item count)
  matching Subsplash's browsing pattern, with a hero banner for featured
  content.
- Featured/pinned series, free-form tags with a `/tags/[tag]` browse page,
  and scheduled publish/unpublish windows.
- Relevance-ranked search across categories, series, and videos.
- Continue watching and recently added rows on the homepage.
- Related content ("More like this" / "You might also like") on series and
  video pages.
- Favorites and a separate Watch Later queue.
- Comments on series and videos, with author/moderator delete.
- 1-5 star ratings, simple view counters, and social share buttons.
- Dismissible site-wide announcement banner.
- Opt-in Web Push notifications when new content is published.
- Sequential unlock: an optional per-series "watch in order" gate.
- Site-wide RSS feed and per-series podcast RSS feed.
- WordPress-style plugin system: every feature above beyond the core CMS is
  independently toggleable, site-wide or per-category.
- phpBB/WordPress-style permission builder: custom named groups bundling a
  fixed set of capabilities, assignable site-wide or scoped to a category or
  series, alongside simpler built-in per-category/series editor grants.
- Append-only audit log of admin/editor actions, exportable as CSV/JSON.
- Bulk admin actions (publish/unpublish/delete/recategorize) and list
  filtering, with drag-and-drop and type-a-position reordering.
- Mobile-friendly responsive layout across the public site and admin CMS.
- PWA support: installable manifest and a minimal service worker for push
  notifications (deliberately without offline page/API caching, since
  content here is dynamic and often member-gated).
