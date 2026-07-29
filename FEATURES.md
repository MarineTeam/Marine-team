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
  across category names, series titles/descriptions/tags, and video
  titles/descriptions.
- **Continue watching / recently added** — a periodic heartbeat approximates
  watch position (see note below) and powers a homepage "Continue watching"
  row with resume-from-where-you-left-off; a "Recently added" row shows the
  newest published series.
- **Trending** — a homepage "Trending this week" row of the series with the
  most logged views in the last 7 days (gated by the View counts plugin,
  which now also logs timestamped view events, not just the all-time counter).
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
- **PWA** — installable (Add to Home Screen / desktop install prompt) with
  a minimal service worker; see the PWA section below.

## Member features (optional plugins — see Plugins below)

- **Favorites** (`/favorites`) — bookmark a series or video.
- **Watch later** (`/watch-later`) — a separate queue from Favorites.
- **Comments** — discuss a series or video, one level of replies deep;
  authors can delete their own comments and replies, moderators can delete
  any (see Permissions).
- **Ratings** — a 1-5 star rating on a series or video; average and count
  shown to everyone, the stars are only clickable when logged in.
- **View counts** — a simple counter shown on series/video pages.
- **Social share** — copy-link and share-to-X/Facebook buttons.
- **Announcements** — a dismissible (per browser session) site-wide banner.
- **Notifications** — opt-in Web Push, sent when an admin publishes a video.
- **Subscriptions** (`/subscriptions`) — follow a series or category; when a
  followed series publishes a new video, its subscribers get a push
  notification (in addition to, and independent from, the general
  Notifications plugin above).
- **Playlists** (`/playlists`) — member-created, ordered, reorderable video
  collections, separate from the single site-wide Watch Later queue.
- **Likes / dislikes** — a thumbs up/down on a series or video, shown
  alongside (and independent from) the 1-5 star Ratings plugin.
- **Watch history** — gates the `/recently-played` page and its bottom-nav
  tab, matching the toggle pattern of the other member features.
- **Profiles** (`/profile`) — lets a member set a display name, shown
  instead of their Auth0 account name in comments and the navbar. Blank
  falls back to the Auth0 name, then the email.
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
  recategorized individually or in bulk.
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

- **Webhooks** (`/admin/webhooks`) — admin-configured outgoing URLs that get
  a JSON POST whenever a series or video is published; optionally signed
  with a secret as an `X-Webhook-Signature` header (hex HMAC-SHA256). Needs
  the Webhooks plugin enabled in Plugins.

## Admin analytics (`/admin/analytics`)

- Needs the `view_analytics` capability. Shows total views over the last 30
  days plus the top 10 series and top 10 videos by view count in that
  window, built from the same timestamped view log that powers the
  homepage Trending row.

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
- **View counts** are a simple per-page-load counter, not deduplicated or
  spam-resistant — a basic "how many hits" number, not analytics. Trending
  and the admin analytics dashboard use a separate timestamped view log for
  the same reason (recency-windowed counts need timestamps, the simple
  counter doesn't have any).
- **Playback speed** is handled by Bunny Stream's own player UI (the ⚙️
  settings icon) — there's nothing to build server-side since the iframe
  embed already exposes it.
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
