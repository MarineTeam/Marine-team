# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
