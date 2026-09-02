# Features

A complete list of what's built. See [README.md](./README.md) for setup and
[CHANGELOG.md](./CHANGELOG.md) for release history.

Everything past the media library is a plugin, off until an admin turns it on
at `/admin/plugins` — a church that wants a video site is not given a prayer
wall it never asked for.

## Where things are

| For the congregation | |
| --- | --- |
| `/` `/categories` `/series` `/videos` | the library |
| `/search` | one search across titles, descriptions, transcripts and hymn text |
| `/services` | the running order for a service, and the hymns in it |
| `/calendar` | the rota, for people with no account |
| `/events` | what's on, and signing up (including things that repeat) |
| `/forms` | connect cards and sign-up forms |
| `/prayer` | the prayer wall |
| `/groups` | small groups |
| `/live` | a live stream, with chat |
| `/tv` | the same library, for a remote control |
| `/link` | signing a television in |
| `/profile` | your own rota, events, groups, downloads and televisions |
| `/profile/settings` | how the site behaves for you — and a copy of your data |

| For whoever runs it | |
| --- | --- |
| `/admin/series` `/admin/videos` `/admin/files` | the library |
| `/admin/services` `/admin/teams` | a service and who is serving at it |
| `/admin/schedules` `/admin/people` | rotas from a spreadsheet |
| `/admin/events` `/admin/forms` `/admin/groups` `/admin/prayer` | church life |
| `/admin/broadcasts` | one message to everybody |
| `/admin/video-feeds` | importing from YouTube or Vimeo |
| `/admin/plugins` `/admin/branding` `/admin/permissions` | how the site behaves |
| `/admin/api-keys` | keys another system uses to read this one |

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
- **Audio has the controls a phone expects** — playing a talk or a hymn puts
  its title, its series and its cover on the **lock screen**, with play,
  pause, a scrubber that actually moves, and skip buttons (15 seconds back,
  30 forward). A **sleep timer** (15/30/45/60 minutes) stops it on a
  wall-clock deadline, so pausing to answer the door doesn't extend the
  night, and a **speed** control sits beside it. The lock screen is claimed on
  play rather than on load, so a page listing eight talks doesn't have eight
  players fighting over it.
  - This is also where the **default playback speed** from `/profile/settings`
    finally applies. It was stored and shown as a reminder because Bunny's
    embed takes no such parameter — a reason that never applied to audio,
    which is our own element.
- **Backgrounding on Android pauses playback** — minimizing the app stops
  the audio; Android's media notification then resumes it with one tap, and
  from there it keeps playing in the background. That resume notification
  has always worked and isn't something this app implements — the browser
  provides it for any playing media. Automatically resuming instead has
  been tried and does not work; see the Technical notes.
- **Cast to TV** — AirPlay needs no code from this app: Safari shows its own
  AirPlay control for any actively-playing `<video>`, including one inside
  Bunny's iframe, since that's a system-level media route. Chromecast is
  different — the default receiver needs a direct, castable file rather
  than an iframe — so a cast button (next to Download, same gate) uses
  Google's Cast Web Sender SDK and reuses the signed MP4 endpoint built for
  Downloads as its media source. **Not verified against a real Chromecast
  device** — there isn't one available in the environment this was built
  in; check it on a preview deploy with an actual receiver. (Bunny's own
  embed turns out to support both natively — `chromecast=true` and
  `disableAirplay` — discovered after this was already built.)
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
- **Per-page metadata** — video, series, category, and speaker pages set
  their own title, description, and Open Graph/Twitter card image (video
  thumbnail, series/category cover, or speaker photo) instead of sharing one
  site-wide `<title>`, so links shared to chat apps and social media preview
  with the real title and image. A member-only page a visitor can't view
  gets a generic "Members Only" title and no image, matching what the page
  body itself withholds from a non-viewer.
- **Breadcrumbs** — video, series, and category pages show a visible
  Home / parent / current-page trail at the top (replacing the old bare "←
  back" link on video and, when unlocked, category pages). The same items
  also build a schema.org `BreadcrumbList`, an invisible `<script
  type="application/ld+json">` tag search engines read for rich-result
  breadcrumbs — it's not shown on the page itself, the visible trail is.
- **Structured data (JSON-LD)** — video pages also emit a schema.org
  `VideoObject` (title, description, thumbnail, upload date, duration,
  embed URL) for Google's video rich results. Skipped, like the breadcrumbs
  above, for content the current visitor can't view.

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
- **Social share** — copy-link and share-to-X/Facebook buttons. Video pages
  also get a "Share at" mm:ss field that copies a link back to that moment
  (`?t=<seconds>`, read on load to seed the player's start time — takes
  priority over the viewer's own resume position), and each chapter in the
  player gets its own 🔗 copy-link button using that chapter's timestamp.
  There's no "share from where I'm currently watching" yet — Bunny's embed
  does support reading live playback position via Player.js, just not
  wired up for this.
  - **Hymns and books share too.** A hymn is the thing in this app most worth
    sending somebody — "we're singing this on Sunday" — and had no way to be
    sent. The same buttons now sit on a hymn's page and a book's, and the
    reader's bottom bar has a **Link** button for the hymn open in front of
    you. That one links by *number* (`/books/<id>?hymn=214`) rather than by
    page, because a page number means nothing to somebody holding a different
    edition and stops meaning anything here the moment the book is re-scanned;
    only an unnumbered spot falls back to its page.
  - Not offered on a members-only hymn or book: a link a stranger can't open
    is worse than no button.
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
- **Downloads** — lets members save videos to their device and watch them
  with no connection. See Downloads below.
- **Book reader** — opens PDF and EPUB files in an in-app reader rather than
  only offering them as downloads. See Book reader below.
- **Chapters** — an admin-managed, ordered list of named timestamps on a
  video; the video page shows a jump-to-section list underneath the player.
  Clicking a chapter reloads the embed starting at that timestamp (Bunny's
  iframe has no seek API — see the technical note below).
- **Transcripts** — a full-text transcript per video, shown in a collapsible
  panel; when this plugin is on, `/search` also matches against transcript
  text (weighted below a title/description match). Pasted by an admin, or
  **written automatically**: see below.
- **Recommendations** — a homepage "Because you watched X" row for logged-in
  members, anchored on the series of their most recently watched video and
  reusing the same same-category/shared-tag logic as related content.
- **Sermon note sheets** — the fill-in-the-blank sheet handed out at the door
  in a great many churches, as a page in the app. An admin writes the outline
  as plain text with three or more underscores marking each gap; the
  congregation fills it in while the talk is going on, and keeps their copy.
  - **Saved as it is typed**, not on a button: somebody filling this in is
    listening to something else at the time, and a Save they forget is the
    whole sheet lost.
  - A gap is identified by its position, so an outline edited afterwards can
    leave an answer against a gap it was never written for. Rather than guess,
    the sheet **says it has changed** — the version it was filled in under is
    stored with the answers.
  - Signed-out visitors get the sheet to read, print and copy; keeping answers
    needs an account, and it says so.
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
    phone number and announcement consent.
  - **Your data**: **Download my data**, then **Delete account** — the two
    halves of the same decision, deliberately next to each other.

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
  playback-rate parameter, and Player.js's documented methods don't cover
  setting one either (see the technical notes).
- **Delete account** requires typing the account's own email address, then
  hard-deletes the `User` row — every relation cascades (comments, notes,
  playlists, favorites, watch progress, push subscriptions, share links they
  created) and the browser is sent to `/auth/logout`. The only trace left is
  the audit-log entry, which stores an email rather than a foreign key. The
  last remaining admin is refused, since that would leave nobody able to
  grant access again.

### Download my data (`GET /api/profile/export`)

One JSON file holding everything the app knows about the member who asked
for it, saved as `marine-team-<name>-<date>.json`. It is the counterpart to
deleting an account: leaving shouldn't mean losing four years of sermon notes,
and "what do you actually hold on me?" deserves an answer that isn't an admin
running queries by hand.

Not behind a plugin. Every other member-facing feature here can be switched
off by an admin; this one answers a question a member is entitled to ask, so
there is no switch for it.

What's in it: the account row and its sign-in methods; favorites, watch later,
follows, playlists, ratings, reactions and watch history; reading positions,
highlights and bookmarks; sermon notes and outline answers; comments and the
reports they filed; teams, rota assignments and unavailable dates; event
sign-ups; form and connect-card submissions; prayer requests they wrote;
small groups; notifications and announcements they were sent; live-chat
messages; push and television devices; share links; and every access grant
held against their name.

Three rules decide the rest, and they pull against each other:

- **Completeness.** If a row is keyed to the member, it's in the file. A
  partial export is worse than none, because it looks complete.
- **Nobody else's data leaves with it.** Most of what a member touches here is
  shared. So a comment carries `isReply: true` but not the comment above it; a
  prayer they interceded for is a request id and a date, not somebody's words;
  a group's address follows `canSeeAddress` from `lib/groups.ts` — the *same
  function* the group's own page uses, so being on the waiting list gets an
  area and no house, and the two rules can't drift apart. The moderator who
  hid a message and the staff member who sent an announcement aren't named.
- **No live secret goes into a downloaded file.** An export gets emailed to a
  laptop and forwarded to a solicitor. Web Push keys, television tokens and
  share-link password hashes are capabilities, not facts, and stay out. Push
  devices are listed by their push service (`https://fcm.googleapis.com`)
  rather than the endpoint that would let a reader push to that phone.

Two guards keep it that way. `assertExportSafe` walks the finished document —
arrays included, since an export is almost all lists — and **throws** rather
than filtering if a forbidden key appears anywhere: a credential reaching that
point means a query changed, and stripping it silently would hide that. And a
test reads `data-export-query.ts` as text, asserting every Prisma call is
scoped to one `userId` and that the file never uses `include:` — a `findMany`
that forgets its `where` exports the whole congregation, and does it quietly.

Rate-limited to two exports a minute per member (counted from the audit log,
which also records each one), since it is the most expensive thing any
logged-in member can ask for.

## The read API (`/api/v1`)

Another system reading this one: a noticeboard in the foyer, a spreadsheet, the
main church website, a migration off some other platform. Until now the answer
to "can I get our own data out" was an admin running queries by hand.

**Everything is a read.** There is no way to change anything through the API in
v1, and that is a deliberate order of work rather than an oversight: a token
that can rewrite the diary is a much bigger decision than one that can read it,
and shipping the read half first means nobody has to make both at once.
`/api/v1` says so in its own response.

- **A key is a password a machine keeps in a config file**, so it is treated
  like one. Only its SHA-256 is stored, it is shown once at `/admin/api-keys`
  and never again, and the list afterwards shows a prefix (`mt_live_A1b2C3…`),
  who made it and when it was last used — the three things anybody wants after
  deciding one has leaked. Revoking keeps the row, so the record survives the
  key.
- **Scopes, with no hierarchy.** `events:read` gives you "forty people are
  coming"; `events:registrations` gives you their phone numbers, and one does
  *not* follow from the other. The two scopes that carry personal data are
  badged as such on the form, because a form that describes them in the same
  tone as the rest is a form where both get ticked without thinking.
- **A group's address has no scope at all.** It is not that you need a special
  one — there is no combination of ticks that returns it, because an address
  travels only with a leader's yes and a machine cannot be given one. The
  member list is out for the same reason: a directory of groups is a different
  thing from a directory of who is in which home group.
- **`assertNoSecrets` is the last thing before the bytes leave**, and it is the
  same guard the member data export uses, from the same list. Both are places
  where a query quietly changing shape becomes a leak; one list is what stops
  the two drifting apart. It **throws** rather than filtering, because a
  credential reaching that point means a query changed.
- **Content comes back including drafts and members-only items**, with flags. A
  key is the organisation reading its own catalogue, and hiding half of it
  would make the API useless for the reporting and migration jobs it exists
  for. What a *visitor* may see is a different question, answered on the pages.
- **Cursor paging, not offset.** Rows are added while a caller reads, and
  `?offset=50` silently skips or repeats whatever moved across the boundary. A
  page asks for one row more than it needs, which is how "is there another
  page" gets answered without a `COUNT` over the whole table.
- **120 requests a minute per key**, counted in a *single* `UPDATE` rather than
  a read followed by a write. Under 30-way concurrency the atomic version
  serves exactly the number of requests that were left; the read-then-write
  version served **60 where 30 remained**. A refused request still counts,
  since it still cost a lookup.
- **`GET /api/v1` needs no key** and describes the whole thing — scopes,
  endpoints, filters, paging, limits. An API whose own documentation needs a
  credential wastes the first five minutes on the wrong problem.

Endpoints: `/me`, `/categories`, `/series`, `/videos`, `/files`, `/events`,
`/events/{id}/registrations`, `/schedules`, `/calendar-events`, `/groups`,
`/analytics`. Files filter on `addedSince` rather than `updatedSince`, because
`FileAsset` has no `updatedAt` — a file is replaced rather than edited, and
calling it the same thing would let a sync job believe it had seen every
change.

## Share links

A revocable, tracked link to one series or video, opened at `/s/[token]`.
Unlike copying the page URL, the sharer keeps a list of what they've handed
out, sees how often each link has been opened, and can switch any of them off.

- **Who can share, and the members-only override.** Overriding the gate is
  **opt-in per link** — a checkbox on the share form, not a consequence of who
  is sharing. Three outcomes, enforced in `shareLinkPolicy`:
  - Content that is already public to anyone: **any logged-in member** can
    share it (with the Share links plugin on). There's nothing to override, so
    the checkbox doesn't appear.
  - Gated content (`memberOnly`, or restricted to viewer groups/users) with
    **no** override: any logged-in member can share it. The link is a plain
    tracked link — it only opens for someone who already has access, which is
    what makes "here's the one I was watching" safe between two members.
  - Gated content **with** the override ticked: only an **admin** or someone
    holding the **`share_content`** capability, and their link carries a real
    access grant. This is how one guest gets into a members-only series
    without loosening it for anyone else. The capability can be granted
    site-wide or scoped to a category/series, so a group can be given sharing
    rights over just their own section — and a scoped holder is still refused
    an override outside that scope.

  The capability is permission to override, never an automatic one: an admin
  who leaves the box unticked sends an ordinary link. Links carrying an
  override are badged **"Grants access"** in both listings.
- **Optional password.** Any sharer can add a passphrase to a link (at least
  6 characters), independent of public vs private — so a public link can be
  "anyone with the link *and* the password". Opening it lands on
  `/share/unlock/[token]`, which asks for the passphrase before the link
  redeems; getting it right is what sets the cookie, so nothing is granted and
  no open is recorded until then. Once unlocked, that browser isn't asked
  again. Stored as a salted scrypt hash (`src/lib/share-password.ts`), never
  returned to any client — not even to the sharer, who can't be shown it again
  — and never included in the recipient email, which only mentions that a
  password is needed. Ten wrong guesses inside 15 minutes and the link stops
  answering for 15 minutes; the tally is kept on the row (serverless has no
  shared memory, same reasoning as `src/lib/rate-limit.ts`) and clears itself
  on success or once the window passes. To change a password, revoke the link
  and make a new one.
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
  that's what the admin list and its Revoke button are for. A link's password
  and expiry can't be edited after the fact; revoke and re-share instead.

## Downloads

Offline viewing: a member saves a video to their device and it plays with no
connection at all. Four independent controls decide whether the ⬇ Download
button appears under a video, and **all** of them have to pass.

1. **The feature** — the Downloads plugin, site-wide at `/admin/plugins`, with
   the usual per-category override (turn it off for one branch of the tree and
   everything under it loses downloads).
2. **The content** — a three-way **Downloads** setting on every category,
   series, and video: *Inherit*, *Allow*, or *Block*. The most specific wins:
   video, then its series, then the nearest ancestor category that has an
   opinion, then allowed. Three states rather than a checkbox because "not
   set" has to differ from "off" — a series left inheriting follows its
   category *later* too, when that category changes. Set it on the category
   and series edit pages; on `/admin/videos` it's a per-row button that cycles
   Inherit → Allowed → Blocked.
3. **The people** — `/admin/downloads` chooses between *any member* and *only
   certain groups or people* (permission groups and/or named individuals, the
   same shape as a restricted item's viewer grants). Admins can always
   download.
4. **The platform** — the same page picks *web and installed app*, *installed
   app only*, or *web only*, so a church can keep offline files to the PWA
   where they belong.

None of this can widen access: `/api/downloads/[videoId]` calls `canViewVideo`
first, so a member can only ever download something they could already watch.
The platform is the one thing the client asserts (only the browser can see
`display-mode: standalone`), which is why it's a placement rule rather than a
security boundary — it never affects *who* or *what*, only *where the button
shows*.

How a download actually works:

- The API hands back a short-lived **signed MP4 URL** (the same CDN
  token scheme the thumbnails use, 30-minute TTL) at the best resolution Bunny
  actually generated — never a guessed height. This needs **MP4 Fallback**
  enabled on the Bunny Stream library, and only for uploads made *after* it
  was turned on — HLS segments can't be handed to a `<video>` for offline
  playback, and Bunny doesn't retroactively generate MP4s for older videos.
  `resolveMp4Source` (`src/lib/download-source.ts`) reads Bunny's per-video
  `hasMP4Fallback` / `availableResolutions` (cached on the `Video` row, synced
  by the sync-status routes) rather than assuming a fixed height, and returns
  one of several specific reasons — no fallback generated yet, nothing at or
  under the configured resolution cap, the CDN rejected the request (403 —
  almost always a token/pull-zone setting, not a missing file), or the file
  really is missing (404) — so a misconfigured library reads differently from
  an unencoded rendition, which reads differently from a video nobody's
  re-uploaded since enabling the setting.
- The browser streams the file into **Cache Storage** with a progress bar,
  under a `/offline-video/<id>.mp4` key on our own origin. The service worker
  answers those URLs from the cache — including **range requests**, so seeking
  works — which is what lets an ordinary `<video>` element play with the
  network off.
- The download cache is deliberately excluded from the service worker's
  activate-time cleanup, so shipping a new version never wipes someone's
  saved videos.
- Everything about *what* is downloaded is per device and never leaves it: the
  file list lives in the browser's own storage, so the server can't tell you
  what's on your phone, and downloads don't follow you to another device.
- **Opening the app with no connection lands on the downloaded videos, not a
  browser error.** The rest of the site is intentionally never cached (it's
  dynamic and often auth-gated), which means a plain page load with no network
  — including the installed PWA's own `start_url` on a cold launch — has
  nothing to serve and would otherwise hit the OS's own "you're offline"
  screen, with no way to reach a video already saved to the device. `public/
  offline.html` is the one exception: a static, unauthenticated, data-free
  page precached at service-worker install time. It reads the same
  `localStorage` download index this feature already writes and plays
  straight out of Cache Storage — no server round trip. The service worker's
  `fetch` handler serves it for any navigation whose network request fails
  (`event.request.mode === "navigate"`, caught and swapped for the cached
  fallback); everything else still goes to the network first, so this never
  makes a page look stale.

Members manage it all at `/profile/downloads`: whether downloads are available
to them (and why not, if not), the Wi-Fi-only vs mobile-data preference, how
much space is used against the admin's suggested cap — **videos and books
together**, since they share the device and a hymnal is often the largest
thing on it, with the browser's own quota shown beside it where the browser
will report one — and per-video **Play offline** / **Remove**. The list self-heals — browsers evict caches silently
under storage pressure, so entries whose file has vanished are dropped on
load rather than offering playback of something that isn't there.

### Books on the device

A hymnal can be saved the same way, and then read with no connection at all.
**Save for offline** on a book's page (`/books/[fileId]`) stores it; the same
page's **Remove** takes it back off, and `/profile/downloads` lists every book
this device is holding. Gated by the same **Downloads** plugin as video, with
the same per-category override, and then by the member choosing to save a
particular book.

Saved books are checked against the live ones whenever you're on their page
or on `/profile/downloads`: a book that has been replaced, or a hymnal whose
lyrics have been corrected, is marked **Update available**, and one that is no
longer available to your account says so. The check is deliberately cheap — a
PDF is asked for a single byte with a conditional request, so an unchanged
book answers with nothing at all — and nothing is ever removed automatically:
a saved book leaves a device when you say so.

Saving stores three things, because reading a hymn offline needs all three:

- **The file**, streamed into Cache Storage under `/offline-book/<id>.pdf`,
  fetched through the app's own content route so access is checked exactly as
  it is for reading the book online.
- **The contents list**, read out of the bytes that were just downloaded
  rather than fetched all over again. Without it there is no way to find hymn
  214 with no connection, which is most of the point.
- **The reader itself.** The offline screen is a static page with no
  application bundle behind it, so it has no way to render a book unless the
  library is already on the device: pdf.js for a PDF, epub.js (with JSZip,
  which its build expects as a global) for an EPUB. They're copied out of
  `node_modules` into `public/` at install and build time
  (`scripts/copy-offline-viewers.mjs`, so they stay the versions
  `package.json` pins) and fetched once, when the first book that needs one is
  saved — a library of EPUBs never pulls pdf.js's 1.7MB.

**Both kinds of book the reader opens can be saved** — a PDF and an EPUB
alike. What differs is the fallback when the library can't be loaded: a PDF
can be handed to the browser's own viewer, while no browser renders an EPUB
on its own, so that offers the file for whatever reading app the device has.

A **hymn-per-file** book — one whose hymns are separate files rather than one
PDF — is saved from its own page, and stores something different: there is no
document to keep, so what goes on the device is the list of hymns with their
lyrics. Offline it reads as the book does online — hymns in printed-page order
under their group headings, a find box that matches a number, a title or a
line of the lyrics, and Back/Next stepping hymn to hymn. Two things follow
from what it stores: hymns with **no lyrics text aren't saved** (offline they
would be blank pages, since the file behind them isn't stored), and because
lyrics get corrected long after a scan would have settled, the button offers
**Update** as well as Remove.

### Searching a hymnal section

The hymns of a scanned hymnal exist only in that PDF's embedded bookmarks, so
they were invisible to search: a category with six books offered six books and
no way to ask which one has the hymn you want.

An admin fixes that once per book, with the same pass that draws the covers
(**/admin/files → Index books**): it opens each PDF, resolves its contents to
page numbers and stores them. After that:

- **The section's own page carries a search box** across every indexed book in
  it — by name, by the number on the board, or by a line of the hymn —
  answering as you type, with each result opening the reader at that page.
- **The site-wide search finds them too**, listed with the hymns that have
  their own lyrics page under **Hymns & books**.
- Section headings ("Advent", "Communion") are searchable as well: they have a
  page like anything else, and are worth going to.

Two things follow from how it's stored. Pages are kept as **PDF pages**, like
every other stored position in a book, so correcting a book's page offset
relabels every result without reindexing. And a book that has never been
indexed simply isn't in the results — the box doesn't appear at all in a
section where nothing has been indexed, rather than looking broken.

#### When a PDF has no bookmarks

Most cheaply scanned hymnals have none: the file is six hundred images and
nothing else, so the indexing pass finds nothing and the whole section stays
without a search box. The contents are printed in the front of the book, so
they can be typed instead — **Type contents…** in a file's Details panel in
`/admin/files`.

One hymn a line: its label, then the page it starts on. `214 Amazing Grace |
230` — a tab or a pipe separates them, and so does the last number on the
line, so a column pasted out of a spreadsheet works as it is. Indent two
spaces to put hymns under a section heading. Pages are the ones **printed in
the book**; the book's page offset is applied for you, and `pdf:2` names a
page of front matter, which has no printed number.

A line that can't be read is listed with its number rather than dropped — a
silently missing hymn is the failure this exists to fix — and the box counts
what it will save as you type. It opens an already-indexed book too, so a
bookmark reading "214 Amazing Grac" can be corrected without re-scanning
anything; what comes back is written exactly as it was stored, nesting
included. The bookmark-reading pass will not overwrite a typed list with an
empty one.

#### A hymn's credits

Five fields sit beside a hymn's words, in the same two places the words do —
a file's Details panel for a hymn that is its own file, the **Hymn lyrics…**
picker for one inside a book: **CCLI number**, **words &amp; music**,
**copyright line**, **key** and **tempo**.

- The **copyright line is shown on the projector**, small, at the foot of the
  screen, for as long as the words are up. Not with the controls, which fade
  after three seconds — a licence requires the line to be visible *while* the
  words are, and something that disappears on its own doesn't meet that.
- The key and tempo are for whoever is playing, and show on the hymn's page.
- The CCLI number is what the report below is for.

#### What we sang, for a licence return

`/admin/services → What we sang` counts every song in a service plan dated
inside a window, and how many services it was sung in — the shape a licence
return asks for — with its CCLI number, author and copyright beside it, and a
CSV export.

Counted from the plans rather than from what anybody looked up: a plan is the
record of what was actually sung, where a hymn opened on a phone on Tuesday
isn't. **Every plan in the window counts, published or not** — a draft that
never got published was still sung if it has a date, and under-reporting a
licence return is the worse mistake. A song with no CCLI number shows an empty
cell rather than being left out: that blank is the thing somebody has to go
and look up before the return can be filed.

#### Words for a hymn inside a book

A hymn that is its own file keeps its lyrics on its row. A hymn inside a
six-hundred-page scan has no row of its own, so its words had nowhere to live
— and a service built from book numbers offered no **Present** button at all.

**Hymn lyrics…**, in the same Details panel, is a picker over the book's
indexed contents: find the number, paste the words, move on. Typing six
hundred hymns isn't the expectation; typing the twenty a congregation actually
sings is.

The words are kept against the **book and the hymn number**, not against the
contents row — so re-indexing the book, re-scanning it, or retyping its
contents doesn't lose them. The trade is that an unnumbered entry has nothing
to key on and can't have words stored. Once typed, a hymn:

- offers **Present** on the book's contents page and on every service plan row
  that names it, not only the first one — a hymn gets sung out of order;
- is found by **a line of its words**, in the section box and in the
  site-wide search, with the line that matched shown under it.

#### Reading a scanned book's text

Search-in-the-book and read-aloud both work off a PDF's text layer, and a scan
has none — so on most hymnals they quietly did nothing. **Read this book's
text…**, again in Details, reads every page: from the file's own text layer
where there is one, and by OCR off the image where there isn't.

- A typeset book is read in seconds. A scan takes a few seconds a page, so a
  hymnal is the better part of an hour — leave the tab open.
- **Stop whenever you like.** Pages are stored in tens as they are read, and
  starting again carries on from the first page not yet held. A book only
  counts as finished when a run reaches its last page.
- Once read, **searching inside the book** answers from the stored text
  instead of parsing the open document — one request, and it works on a
  photograph. Results read off a scan say so, since OCR misreads a word here
  and there.
- The **section search** uses it too: a page that matches is attributed to the
  hymn it falls inside (the last contents entry at or before that page), so
  what comes back is still a hymn to open rather than a page number. This is
  the only way a hymn nobody has typed the words of is findable by its words.
- Replacing the file throws the reading away with the rest of what described
  the old bytes.

The OCR engine (tesseract.js) is served from this app's own `/tesseract`, not
a public CDN — copied out of `node_modules` at install time like the offline
readers, so it works on a filtered office connection.

### Replacing a book

A re-scanned hymnal is the same book, so it keeps the same row. **Replace the
file**, in a file's Details panel in `/admin/files`, points that row at new
bytes: a small file uploaded straight from the panel, or — for anything past
the app's 4MB upload cap, which a scan always is — an object uploaded to
Bunny Storage and chosen from the same listing the importer uses.

Doing it this way rather than adding the new scan as a new file is the whole
point. Everything that refers to a book refers to its row: where each member
got to, their marks, the `?page=` links on its contents list, its podcast
episode, and every copy saved to a phone. A new row leaves all of that on the
old book with nothing to say it has been superseded.

What it does and doesn't touch:

- The title, series or category, page offset and every other setting stay.
  **Check the page offset** if the new scan's front matter differs — the
  stored page numbers are unchanged, so the printed numbers shown beside them
  follow whatever the offset says.
- Saved places and marks stay, and they are page numbers: a scan with
  different pagination will move where they land.
- The cover, hymn count and indexed contents are cleared, because they
  described the old file — re-run **Index books**. Until then the book's hymns
  are absent from search rather than pointing at the wrong pages.
- A podcast episode is re-copied to the public zone from the new bytes.
- Devices holding this book offline show **Update available** the next time
  they're on its page or `/profile/downloads`.
- The replacement has to be the same kind of book — a PDF for a PDF, an EPUB
  for an EPUB — since every saved place is in that format's own terms.
- The old object stays in Bunny Storage, at its own path (the new bytes never
  overwrite the old ones, or the CDN would keep serving the old file). It
  turns up in the storage importer, where it can be dealt with once the new
  scan has been checked.

### What the offline screen shows

`public/offline.html` is served for any navigation that can't reach the
network, and it is now a small app of its own rather than a list of videos:

- **The same bottom bar the app draws.** The app leaves a snapshot of its
  tabs where this page can read it, so losing the connection no longer loses
  the icons. Sections holding something saved on this device are shown in
  full colour; the icons are the app's own.
- **What is saved, under the icon you tapped.** The page is served *at the URL
  that was asked for*, so it knows whether you tapped Hymnals or Home. Tapping
  Hymnals lists the hymnals — including books filed under a series inside that
  section — and a link straight to a book (`/books/<id>` or `/read/<id>`)
  opens that book.
- **The hymn number, typed.** The same **Go to hymn** box as online, above a
  saved book's contents — the one moment it matters most, since a service
  with no signal is exactly when nobody wants to scroll a list.
- **A book's contents, then its pages.** Entries are listed with the numbers
  printed in the book (the page offset is stored with it), and opening one
  draws that page with pdf.js: swipe left and right, arrow keys, zoom, and a
  bar naming the hymn you are on. Where a browser can't draw the pages
  itself, the book is handed to that browser's own PDF viewer at the right
  page rather than showing a blank sheet.
- **Or an EPUB's chapters**, rendered by epub.js exactly as the in-app reader
  does — scrolling rather than paginated, with the chapter you're in named in
  the bar. The arrow keys and the swipe are registered inside the frame
  epub.js owns, which is where the reading actually happens.
- **Or a hymnal's hymns, then one hymn's lyrics**, for a hymn-per-file book —
  searchable, grouped, and steppable with Back and Next. A link to a single
  hymn (`/hymns/<id>`) opens it directly when its book is on the device.
- **A saved service's running order.** The books are forty megabytes; the
  sheet saying which hymns to open is two kilobytes, and it is the thing you
  need first. Each hymn is listed with its number, its name and any note, and
  a hymn whose book is on this device opens that book at it. One whose book
  isn't says so on the row rather than offering a button that does nothing.
- **Downloaded videos**, exactly as before.

The **in-app** reader survives the connection dropping while it is open, too:
the service worker answers `/api/files/[id]/content` from the saved copy —
but only after the network has actually failed, and only for a book this
device was deliberately given. A cached copy never stands in for an access
check that said no.

## Services

The hymns for a service, in the order they'll be sung. Staff build a plan in
`/admin/services` — a title, a day, a note, and the hymns — and publish it;
members open `/services`, pick the day, and tap straight through to each hymn.
Gated by the **Service plans** plugin.

A plan holds the two shapes a hymn takes in this app (see the Hymnals notes
above):

- **A hymn that is its own file** opens at its lyrics page.
- **A number inside a whole-book hymnal** is written down as the number that
  goes up on the board. The page it lands on is worked out from that book's
  own contents when a member opens it — the browser reading the PDF is the
  only thing that knows which page hymn 214 is on, so the plan links to the
  book's contents carrying the number and the contents page does the rest.

This is deliberately not a playlist: playlists are a member's own, hold videos
and have no date. A plan is one copy that everyone in the building opens, and
it stays a draft until somebody is happy with the order.

A hymn that has since been unpublished, or one a signed-out visitor can't
open, still appears in the order rather than leaving a gap — it is being sung
either way — and says why it doesn't open.

Each row is named by the **hymn**, not the book it is in. A plan item points
at a file and a number, and the file's title is the book's — so an order built
from one hymnal used to read "214 Church Hymn Book, 302 Church Hymn Book". The
book's indexed contents know what 214 is called, so they are asked. A book
nobody has indexed still falls back to its own title.

### Taking the order with you

- **Keep this order offline** saves the running order to the device. It is a
  couple of kilobytes against a hymnal's forty megabytes, so it is worth doing
  on the way out of the house; the books themselves are saved separately, from
  their own pages, and the button says so rather than implying it took them
  too. With no connection, the plan is on the offline screen, and a hymn whose
  book is also saved opens straight to it.
- A running order gets reordered up to Saturday night, so a saved copy is
  checked against the server whenever the page is opened: a plan that has
  changed since says **Order changed — update** rather than being quietly
  wrong in somebody's hands.
- **Print the order** hands the whole thing to paper — the numbers, the names
  and the notes, with the app's chrome, its buttons and its "members only"
  badges left off. Gated by the same **Downloads** switch as saving anything
  else to a device.

### Who is serving (the rota)

A running order says what is being sung; a rota says who is there to do it.
Both live on the same plan.

- **Teams** (`/admin/teams`) are the groups you schedule from — musicians,
  welcome, sound, readers — each with its members and what each of them
  usually does, which is offered as the default when they're scheduled.
- **Building the rota** happens on the plan itself, under the hymns: pick a
  team, pick a person, name the job. **Asking somebody sends them a
  notification** on the same three channels as everything else (push, email if
  they opted in, and the profile inbox that works whatever they allowed).
- **They answer.** `/profile/rota` lists what a member has been asked to do,
  with **Yes, I can** and **Can't make it** — and a decline can carry a
  reason, because a "no" without one just moves the conversation to text
  message. That answer is what the person building the rota sees beside each
  name, and it is the whole difference between a rota and a list.
- **When you're away.** A member can record dates they can't serve. Whoever
  builds the rota is warned that somebody is away *before* they ask — it does
  not stop them asking, because sometimes a rota is a conversation.
- **On the service page**, the people serving are listed for everyone who
  opens it — but **only those who have said yes**. An outstanding ask is a
  conversation between two people, not a notice board.

An unanswered ask stays on a member's rota page even after its date has
passed: it doesn't stop being unanswered because the day went by.

## Schedules (`/calendar`)

The other kind of rota, brought over from the calendar app: any number of
recurring schedules — Breakbread, Welcome, Sound, Senior Visit — read by
people who never log in, and fed either from a Google Sheet somebody already
maintains or from the admin interface here.

Deliberately separate from the service rota above. That one puts **accounts**
against a service's running order. This one puts **names** against recurring
rotas, and most of those names have no account and are not going to make one.
Gated by the **Schedules** plugin.

### For everybody

- **Choose your name once.** No account, no password: it is a preference on
  that device, like the theme, and grants access to nothing — every schedule
  here is readable by anyone with the URL either way. "Everyone" is a
  first-class answer.
- **What's next**, a **list** by day, or a **month grid**, filtered to one
  schedule with the chip row and to yourself with **Only mine**.
- The page is **not indexed**: it carries people's names.

### For whoever keeps the rota (`/admin/schedules`)

- A schedule is **managed here** or **fed by a Google Sheet**, and everything
  downstream — the calendar, the API, the reminders — cannot tell which.
  Switching one over later keeps the events already imported, as ordinary
  editable rows.
- **Test connection** shows the first few events exactly as the parser read
  them, plus every row it skipped and why, *before* anything is imported. A
  column mapping is guesswork until you can see what it made of the sheet.
- Two spreadsheet layouts are understood: `Date | Names` with everyone in one
  column, and `Date | Devin | Cindy | …` with a column each marked ×. A cell
  with other text in it doubles as the job ("Bread"). Columns obviously not
  people — Notes, Week, Location, Time — are skipped, so a sheet with a notes
  column doesn't acquire a person called Notes.
- Dates are read forgivingly: `July 10`, `july 10th`, `Sunday, July 12`,
  `7/10`, `2026-07-10` and a real spreadsheet date all work. **A cell nobody
  can read is skipped and reported, never guessed at** — one bad row never
  aborts an import.
- **A failed sync deletes nothing.** If Google is unreachable, what was
  imported before stays exactly as it was, and a payload that hasn't changed
  upstream does no writes at all.
- **People** (`/admin/people`) are names, created automatically as they turn
  up. Spellings that differ only in case, spacing or accents are already one
  person; genuine near-duplicates ("Dave" and "Davey") are *suggested* for
  merging and never merged automatically. A merge moves the history onto one
  record and keeps the other spelling as an alias, so the next sync resolves
  to the right person instead of recreating the duplicate.

### On the device

**Keep the calendar on this device** puts the whole year of rotas on the
phone. It is the smallest thing this app can save — a few kilobytes of text
against a hymnal's forty megabytes — and the only one that keeps itself
current: once saved, opening the calendar with a connection quietly asks the
server for *what has changed since last time* and folds it in. Nobody has to
remember to press update to find out they are on for Sunday.

With no connection at all, it appears on the offline screen beside the saved
books, videos and service orders: pick your name — the same name the app
uses, so choosing it in one place settles it in both — and see what you are on
for, with the day named the way the app names it.

Two things the payload never says, the device works out for itself, because
getting either wrong means somebody turning up when they shouldn't:

- **A schedule that was turned off takes its dates with it.** Disabling a
  schedule doesn't touch one event row, so those dates are never reported as
  changed or deleted. They would otherwise sit on the phone for good.
- **Days that fall out behind the window are dropped**, for the same reason:
  nothing deletes them, they simply stop being sent.

### Reminders, and what didn't come across

A daily job tells people what they are on for tomorrow, one message however
many rotas they are on — through this app's existing push, email and profile
inbox rather than a second notification stack.

### When somebody can't make it

The rota models an ask and an answer. What it had no word for is the thing that
happens most often *after* a yes: something comes up. Without one, the whole
exchange goes to text message and the rota keeps saying somebody will be there
who won't.

- **"Ask someone to cover this"** puts the slot in front of the rest of that
  team — and nobody else, because a cover request is addressed to the people who
  could do the job. Everyone on the team is told once.
- **Somebody unanswered can ask too.** "I've been asked and I can't — does
  anyone else want it?" is a real thing to say, and making them accept first in
  order to hand it on would be a step that exists only to satisfy a state
  machine. Somebody who has already *declined* can't: there is nothing to cover.
- **The slot changes hands, once.** Two people pressing "I'll take it" in the
  same second is not rare on a Sunday morning, so the write is conditional on
  the slot still being open *and* still being held by the person who asked —
  one winner, and the other is told somebody beat them rather than both being
  thanked.
- **A volunteer who marked themselves away is warned, not refused.** They have
  almost certainly changed their plans, and a rota that argues with the person
  offering to help is a rota nobody helps with. Being already on that service
  *is* a refusal, with the reason said plainly rather than a caught database
  constraint.
- **The rota remembers whose it was.** The organiser's page shows *needs cover*
  against an open request and *covering for X* once somebody has stepped in, so
  a swap reads as a swap rather than as the name quietly changing.
- **The old note doesn't follow the slot.** It was the previous person's aside
  to the organiser, and carrying it onto somebody else's acceptance would put
  words in their mouth.

That has a consequence worth stating plainly: **somebody on a rota with no
account gets no reminder.** The calendar app reached them through anonymous
per-device subscriptions; this app's push is keyed to an account. Linking a
name to a member's account is what turns reminders on for them, and everyone
else still has the calendar, which is the source of truth.

## Events

What's on, at `/events`, and who is coming.

- **A date, a place, a description**, and optionally sign-up. Plenty of events
  are worth publishing with nothing to fill in — a carol service everybody
  simply comes to — so sign-up is a switch rather than an assumption.
- **You don't need an account to sign up.** The people a church most wants at a
  men's breakfast are the ones who have never made one. **Members only** is how
  an event closes that, and such an event is invisible — not refused — to
  anyone not signed in, because a title is a leak too.
- **Places, and what happens when they run out.** A guest counts as a place,
  because a guest sits somewhere. When it is full, sign-up becomes a waiting
  list, or refuses outright if the waiting list is turned off.
- **The last place goes to one person.** Everything that decides "is there
  room" happens under a lock on the event, so four people pressing the button
  in the same second get one yes and three places on the list — not four yeses
  and an overbooked hall.
- **The waiting list moves by itself** when somebody drops out, and again when
  an organiser raises the capacity. It **stops at the first party that doesn't
  fit** rather than skipping ahead to a smaller one: two places free and a
  family of four at the front means nobody moves, because passing over that
  family to seat the couple behind them is exactly what people notice and
  rightly resent. Whoever moves up is told.
- **Members see their own sign-ups** at `/profile/events`, and can cancel from
  there or from the event.
- **Organisers get the list**, on screen and as a CSV for the door, a
  mail-merge or a spreadsheet — with a column saying who is a member, which is
  the one thing the sign-up form didn't ask.

### Something that repeats

A weekly Bible study used to be twelve events typed twelve times. Now it is a
rule, set up at `/admin/events`, kept filled in six months ahead by a daily job.

**A series is not itself an event.** Every date it produces is an ordinary
`Event` row with its own slug, capacity and sign-up list, because "is there a
place for me on the 14th" is a different question from "is there a place on the
21st" and only a real row can answer both. The occurrence's URL says which week
it is for — `/events/prayer-meeting-2026-01-06` — so a link in a newsletter
lands on the right one.

- **The rule is real RRULE** (`FREQ=WEEKLY;BYDAY=TU`), the syntax every calendar
  exports, but nobody types it: the form offers the five repeats a church diary
  actually contains — weekly on chosen days, daily, monthly on the same date,
  monthly on the nth weekday, monthly on the last weekday — and the monthly ones
  read their weekday off the first date rather than asking twice. What it comes
  to is shown back as a sentence ("Every month on the last Saturday") before it
  is saved, because `FREQ=MONTHLY;BYDAY=-1SA` is not something anybody should
  have to read to check they picked the right one.
- **Times are a wall clock and a zone, not instants.** "Tuesdays at 19:30" is
  19:30 in January and in July; a series expanded as instants loses an hour
  every March. The hour that never happens on the morning the clocks go forward
  resolves forward, to when people actually arrive, and the hour that happens
  twice in October resolves to the first of them. See `lib/recurrence.ts`.
- **The sign-up window moves with each date.** Stored as "opens 14 days before,
  closes 2 days before" rather than as two instants — copying one pair onto
  every date would close December's sign-up in September.
- **Removing one date sticks.** The date goes onto the series' exclusion list in
  the same transaction as the event is deleted, so tonight's generator doesn't
  see the gap in the rule and put the cancelled meeting straight back.
- **Editing never rewrites the past.** A title corrected in March renames every
  date still to come and leaves February's alone — that is what happened, and a
  diary that revises it is a worse record than a paper one.
- **Changing the timing leaves booked dates where they are.** Empty future dates
  are cleared out and laid down again from the new rule; a date somebody has
  signed up for stays put, listed under the series, so the organiser can see
  which ones didn't move and ring round. Moving a meeting somebody has booked is
  a conversation, not a database write.
- **Stopping a series never deletes somebody's place.** Future dates with nobody
  down for them are removed; anything past, and anything with a sign-up on it,
  survives as an ordinary one-off event. A sign-up is a promise to a person, and
  unscheduling is not a way to break it.
- **Generating is idempotent**, so the daily job, a missed run and an admin
  pressing save all produce one diary. A unique index on (series, date) is the
  backstop; the generator asking what already exists is what stops it firing.
- **Members see it on the event page**: the series in words, and the next few
  dates as links — somebody who has just missed one wants to know when the next
  is more than anything else on that page.

### In your own calendar (`.ics`)

Everything this app knows the date of can be read by Google Calendar, Outlook,
Apple Calendar and every phone. Three feeds, each with a different answer to
"who is this for":

- **One event** — `Add to my calendar` on its page, at
  `/events/<slug>/event.ics`. A members-only event refuses this outright rather
  than gating it on a session: the URL is opened by a calendar application, and
  there is nobody there to check.
- **What's on** — `/events/calendar.ics`, a public feed to subscribe to once.
  Member-only events are absent for the same reason.
- **Your own diary** — what you're serving at, what you've signed up for, and
  the dates a rota names you on, at
  `/api/calendar/<token>/marine-team.ics`. Made on request from
  `/profile/settings`, and **the token in the URL is the whole of the
  authentication**, because a calendar app cannot log in. So: nobody has one
  until they ask, it can be **replaced** (which stops every calendar following
  the old link) or **stopped**, it is never cached by a shared cache, it carries
  `X-Robots-Tag: noindex`, and it is on the export's forbidden-key list so it
  can never travel in a downloaded file.

Details that decide whether a calendar shows the right thing:

- **A declined rota date is written as `STATUS:CANCELLED`, not left out.**
  Omitting it would leave the entry sitting on the phone of the one person who
  already said no.
- **An all-day event's `DTEND` is the following day**, because DTEND is
  exclusive — writing the same day is what makes all-day events vanish from
  month view in some clients.
- **A repeating event is one entry per date, not one `RRULE`.** That matches how
  it is stored — each date is a real event with its own place count and its own
  page — and a cancelled week is simply absent, with no `EXDATE` list to keep in
  step. `RELATED-TO` groups them.
- **Lines fold at 75 octets without splitting a character.** Octets, not
  characters: cutting between the bytes of an em dash produces a black diamond
  halfway through a word, which a calendar shows rather than rejecting.
- **A sign-up on the waiting list says so** in its title, which is exactly the
  thing somebody forgets between signing up and the day.

Not yet: `CalendarEvent` (the rota side) still carries `recurrenceRule` and
`recurrenceEndDate` columns that nothing reads. The core they need now exists;
wiring it up means deciding how expanded dates travel through the offline
snapshot's delta sync, which is a separate piece of work.

## Forms and connect cards

A form is built at `/admin/forms` and filled in at `/forms/<name>`. The
questions are rows somebody adds, not code somebody deploys — they change every
term, and "add a box for dietary requirements" shouldn't need a release.

- **Ten kinds of question**: short and long answers, email, phone, number,
  date, a drop-down, choose-one, choose-any, and a single tick box.
- **You don't need an account**, which is the whole point of a connect card:
  the person it is for walked in twenty minutes ago. **Members only** closes
  that where it matters, and such a form is invisible rather than refused.
- **Renaming a question doesn't rewrite history.** An answer belongs to the
  question, not to the words it was asked in.
- **Stopping a question keeps its answers.** A question is retired rather than
  deleted, so the responses from March can still say what they were answering,
  and the export keeps that column — after the live ones.
- **The server has the last word on what a valid answer is.** A crafted request
  can't invent a fourth answer to a three-way question.
- **Somebody is told**, at the addresses the form itself names — different forms
  reach different people, and the person who knows which is the one editing it.
- **Responses are marked dealt with, by name.** The way follow-up fails is two
  people each assuming the other rang.

## Prayer wall

Ask for prayer at `/prayer`, and pray for what others have asked.

- **Nothing appears until somebody reads it.** Every request waits in a queue.
  This is deliberately not a setting to turn off: an unmoderated prayer wall on
  a church website is a liability with a "post" button.
- **Anonymous means anonymous.** A request can be posted without a name. The
  row still knows whose it is — so the writer can take it down and a moderator
  can act if it is abusive — but no screen anywhere shows it, **including the
  moderator's own queue**, because that screen gets left open on an office
  laptop and a photograph of it is how an anonymous request stops being one.
- **Three audiences**: anyone who visits the site, members, or only the people
  who look after prayer — for the ones that shouldn't be a wall at all.
- **You always see your own**, even while it is waiting. Otherwise writing one
  and hearing nothing looks exactly like it having been thrown away.
- **"I prayed for this" is a number, not a list of names.** The number is an
  encouragement to whoever asked; the names would turn it into a scoreboard. It
  needs an account only so that pressing it twice isn't two.
- **Answered requests stay up**, with a line saying what happened — which is
  the reason to keep a prayer wall rather than a suggestion box.
- The page is never indexed, and the request text never reaches the audit log.

## Small groups

The home groups and studies that meet during the week, at `/groups`.

- **Where it meets is two questions, not one.** A district ("North side, near
  the station") is on the page for anybody. The address is given only to people
  actually in the group. Most of these meet in somebody's living room, and an
  address that has been public once stays somewhere for good.
- **Asking to join is a request the leader answers**, and that is what keeps
  the address safe rather than being politeness: somebody who has only asked is
  not given it, or anyone with an account could learn where a leader lives by
  pressing a button.
- **A leader is not staff.** Whoever hosts the Tuesday group answers the people
  who have asked, on the group's own page — no admin access, no capability to
  be granted, no ticket to whoever runs the website.
- **A full group stays on the list and says so.** The question somebody has is
  "can I come"; "not this one, it's full" answers it, and hiding the group
  doesn't.
- **A group with no leader is flagged**, because it looks perfectly fine on the
  list while having nobody to answer a request.
- Only a yes is a notification: a no is a conversation, and a push saying "you
  were turned down" is the wrong way for anybody to hear it.
- Members see their groups at `/profile/groups`, and can leave or withdraw a
  request at any time.

## Announcements

One message to everybody, or to one group, from `/admin/broadcasts`.

- **Choose an audience**: everyone, a permission group, a small group, a
  service team, or everyone signed up to an event — most of whom have no
  account, and are reachable at the address they typed.
- **Email, text, push**, any combination.
- **It tells you who it will reach before you send it**, and why the rest it
  won't: "reaches 312 people — and 41 get nothing · 28 no mobile number, 13
  turned off announcement emails". Without that number, "I told everyone" is
  false and the people who got it assume everybody did.
- **Consent is three separate rules.** Email is on unless somebody turned
  announcements off — a different switch from "email me when a sermon
  publishes", because turning that off is not asking to miss a cancellation.
  A text needs an explicit yes and a number the member typed in themselves;
  a number given on a public event form is never treated as consent. Push
  needs a device already signed up.
- **Send yourself a test first.** The one thing that makes a typo in a message
  to four hundred people survivable is having read it on a phone.
- **It survives being interrupted.** The list is frozen before anything goes
  out and each person is marked as they are sent, so closing the laptop
  half-way means the rest go later — not that everybody gets it twice.
- **One bad address doesn't stop the rest**, and the failures are listed
  afterwards with the reason the provider gave.
- Texting works through Twilio or your own gateway; with neither set up, the
  channel says exactly which settings are missing. The cost in message
  segments is shown as you type — a single curly apostrophe pasted from a word
  processor halves what fits in one text, which is worth knowing before it is
  multiplied by three hundred.

## Languages

The app's own screens come in English and Spanish, and a church can add a third
by adding one file.

- **It follows the browser first.** Somebody whose phone is in Spanish gets
  Spanish without finding a setting — `Accept-Language` is honoured with its
  quality weights, and `es-ES` or `es-419` both mean Spanish. A language the
  app doesn't speak falls back to English rather than half-translating.
- **A choice sticks**, on that device, next to the theme.
- **What is translated**: the navigation, and the events, forms, prayer and
  small-group pages — the ones a visitor who doesn't read English most needs.
  The library, the reader and the admin screens are English only for now.
  Adding to a language is filling in one file; a key missing from it won't
  build, and a translation that has quietly dropped a number from a sentence
  fails a test.
- **What language a sermon is in is a different question**, and has its own
  setting on a video and on a series. An episode with no answer takes its
  series'; a series with no answer is the site's default. Deliberately not
  "any language": filing every untagged sermon under every language would make
  the filter useless in the church that most needs it, where most of the
  archive predates anybody thinking about this.

## Importing from YouTube and Vimeo

A church that streams its service to YouTube every Sunday already has the
sermon there. `/admin/video-feeds` points at a channel, playlist, Vimeo account
or showcase and brings them in nightly.

- **An imported video is an ordinary video.** It goes in a series, gets a
  speaker and scripture references, appears in search, can be favourited and
  put in a playlist — it simply plays in the source's own frame, with a
  "Watch on YouTube" link for anyone who would rather.
- **Editing an import sticks.** Rename "Sunday Service 12/10/25 || FULL
  SERVICE" to "The Cost of Discipleship" and no later sync will undo it. Each
  field is compared against what the source said last time, so untouched fields
  keep updating and edited ones are left alone — one field at a time, so
  renaming the title doesn't stop the description importing.
- **New imports arrive unpublished** unless the feed says otherwise, because a
  church that streams its whole service doesn't want the twenty minutes of an
  empty stage appearing on its own site.
- **What an imported video cannot do**, and says so rather than failing:
  downloads (there is no file of ours), captions (they are the source's),
  automatic transcription (it needs a file), and thumbnail upload. The download
  button doesn't appear at all.
- **A feed that hasn't changed costs one request**, and removing a feed keeps
  the videos it brought in.
- Needs `YOUTUBE_API_KEY` or `VIMEO_ACCESS_TOKEN`; without one the screen says
  which is missing rather than importing nothing every night in silence.

## Live chat

A chat beside a live stream, switched on per stream at `/admin/live`.

- **Off unless somebody turns it on.** A members' prayer meeting and a carol
  service streamed to the wider world are not the same decision.
- **Open only while somebody is watching** — half an hour before the start
  until an hour after the end. Early enough for people arriving to say hello,
  long enough that the conversation a service starts isn't cut off
  mid-sentence, and then closed. The messages stay readable; the box goes.
- **Slow mode**, in seconds, raised by a moderator when a stream gets busy. It
  counts from *that person's* last message, not the chat's — limiting the whole
  chat would let one fast typist silence everybody else.
- **Anyone can take down their own message; a moderator can take down
  anybody's**, and mute somebody for that stream, which also hides everything
  they have already written. A muted person is muted for the evening, not for
  ever — a site-wide ban is a different decision, made calmly on a different
  screen.
- A removed message never reappears, even in a browser tab that was a few
  seconds behind.
- The page asks for new messages every few seconds and **stops entirely while
  the tab is hidden** — a church leaves this open on a laptop all week.

## On the television

Three separate things, and it is worth being plain about which is which.

### Sign in with a code on the screen

You cannot type an email address and a password with a remote control. A
television shows six characters; somebody opens `/link` on their phone, types
them, and is asked — by name — whether to sign *that* television in. The
television, which has been asking all along, gets a token a few seconds later.

The code on the screen is not the thing that signs anything in. It is visible
to everybody in the room, so it only ever names a request; a separate secret
that never leaves the television is what redeems it. The characters avoid every
pair that looks alike on a screen, and typing the one you thought you saw still
works.

Members see their signed-in televisions at `/profile/devices` and can sign one
out at any time — worth doing for a set they no longer have, since the sign-in
does not expire on its own.

### A catalogue feed

`/api/tv/feed.json` is the shape Roku's **Direct Publisher** reads: point a
channel at it and Roku builds and ships a real television channel, with no
BrightScript and nothing to maintain. `/api/tv/feed.xml` is the same catalogue
as MRSS, which most other platforms and search integrations take.

**Only public content goes in a feed.** A feed is fetched by somebody else's
server with no session, cached by them, and republished to every television
that installs the channel. There is no login to put in front of it, so anything
members-only is excluded — including a public video inside a members-only
series.

### A screen for a remote

`/tv` is the app at arm's length: large type, margins that survive a
television's overscan, and focus that moves with the four arrows. Nothing
wraps at the end of a row and moving between rows keeps your column, because
with no pointer, focus reappearing somewhere unexpected leaves you lost. It
works today in the browsers built into Samsung and LG sets, and on anything
with an HDMI stick.

### What is not here

**A native Roku, Apple TV or Android TV app.** Each is a separate codebase in a
different language, a developer account, a store review and hardware to test
on — none of which lives in this repository, and none of which can honestly be
built from it. What is here is everything such an app would need from this
side: the sign-in, the catalogue, and a screen that already works.

## Present mode

A hymn's words on the screen at the front of the room. **Present** sits on a
hymn's page; **Present this service** sits on a service plan and starts at its
first hymn with words, carrying on through the order — whoever is driving
never goes back to a list between hymns.

- **One verse at a time**, as large as it will go, white on black with a light
  option for a bright room. Verses come from the shape the lyrics were typed
  in: a blank line separates them, and a block that names itself ("Chorus",
  "Refrain:") is that rather than a numbered verse, so the numbering skips it
  the way the printed book does.
- **Driven from anywhere.** A presenter's clicker is a keyboard, so
  PageDown/PageUp turn a verse, as do the arrows and the space bar; tapping
  the right of the screen moves on, the left goes back. The chrome fades after
  three seconds and returns on the first touch, key or nudge of the mouse.
- **It stays awake and stays put** — the same screen lock as the reader, and
  full screen is one button (or `F`).
- Text size and palette are remembered **per device**, because the projector
  in the hall and the phone in your hand want different answers.

Only words can be presented — a scanned page is a photograph, not text. They
can be the lyrics on a hymn's own row, or words typed against a number inside
a whole-book hymnal (see **Words for a hymn inside a book** above), so a plan
built from book numbers is projectable once somebody has typed those hymns
out. A hymn with nothing saved says so rather than showing an empty screen.

## The bottom bar

In the installed app the row of icons along the bottom is the only navigation
there is, so what belongs in it depends on why someone opened the app. **This
device → Bottom bar** in `/profile/settings` adds, removes and reorders the
destinations it holds: Home, Search, New, any section of the library (a
Hymnals category included), your own lists, Profile, and Admin for staff.

- **Five across, then it scrolls.** Five is what fits on a phone before the
  labels stop being readable, so up to five share the width the way a tab bar
  normally does. Add more — up to ten — and the icons keep a thumb-sized
  width of their own and the row scrolls sideways instead of squeezing, with
  the section you are in scrolled into view. The picker marks the ones that
  sit past the fold.

- Stored **per device**, with the theme and playback preferences — the same
  member can have the hymnal on their phone and the default set on the church
  computer — and applied the moment it changes, with no reload.
- A device that has never touched it keeps exactly the bar it had.
- A choice is stored as destinations, not positions, and re-resolved against
  what that viewer may currently see: a category that gets unpublished, or a
  page whose plugin is switched off, drops out of the bar rather than sitting
  there leading nowhere. If nothing survives, the app's own suggestion is
  drawn, because an installed app with an empty bar has no way to get
  anywhere.
- The bar is snapshotted for the offline screen each time it renders, which
  is what lets those icons still be there with no connection.

Limits worth knowing: the Wi-Fi-only preference relies on the Network
Information API, which only Chromium implements — where the connection type
can't be read, downloads go ahead rather than being blocked everywhere. The
storage cap is advisory (the browser's own quota is the real limit) and never
interrupts a download in progress. And downloads are MP4 files in a normal
browser cache: this is offline convenience, not DRM.

## Book reader

PDF and EPUB files open in an in-app reader at `/read/[fileId]` instead of
only being downloadable. A **Read** button appears next to Download on any
file the reader can open, wherever files are listed (a series or a category).
Gated by the **Book reader** plugin, which a category can turn off for its
own section like any other.

- **Reading** — PDFs render page by page with zoom and a page jump box;
  EPUBs reflow as a scrolling document, which reads better on a phone.
- **Swipe to turn the page** — in a PDF, a swipe left or right turns the
  page, and the arrow keys do the same on a desktop. Scrolling still
  scrolls: the gesture decides which way it is going before it claims the
  touch, a second finger is a pinch-zoom, and once you have zoomed in past
  the width of the screen a sideways drag pans the page instead. Turn it off
  from the reader's toolbar or under **Reading** in `/profile/settings` —
  per device, like the other settings there.
- **Contents** — the PDF outline or the EPUB navigation document, nested,
  each entry jumping straight to its place. A contents entry whose
  destination doesn't resolve is shown greyed rather than dropped, so a
  half-broken outline doesn't look like an empty one.
- **Go to hymn 214** — a **Hymn** box in the reader's contents bar takes the
  number on the board and opens that hymn, which in most books is not the
  page it is printed on. The same box sits on a book's contents page (it
  opens the reader there) and on the offline screen. The number is read from
  the front of each contents entry — "214", "1. Holy, Holy, Holy", "Hymn 45",
  "No. 12", "#7" — never from inside a title, since following a number that
  happens to end a title would look like it worked and be wrong. Books whose
  contents aren't numbered don't show the box.
- **Back and Next, by hymn rather than by page** — a bar along the bottom of
  the reader names the entry being read and steps to the one either side of
  it, using the book's own contents. **Back** goes to the start of the hymn
  being read before it goes to the hymn before it, which is what you want
  after paging past the first verse. A book with only one contents entry, or
  none that resolve, shows no bar.
  - In a **hymn-per-file** book — one whose hymns are separate files rather
    than one PDF — the same arrows sit at the foot of each hymn's page,
    stepping in the order that book's list shows and skipping any hymn the
    viewer can't open.
- **Search in the book** — matches across every page (PDF) or spine section
  (EPUB), listed with a snippet of surrounding text. Where an admin has read
  the book's pages (see **Reading a scanned book's text** above), the search
  answers from that instead: one request rather than six hundred pages parsed
  in the browser, and it finds words on a scan, which searching the open
  document never could. Results read by OCR say so.
- **Page offset** — a scanned book whose printed page 1 sits behind a title
  page and ten pages of contents would otherwise be listed by its PDF page
  numbers, which match nothing in the paper copy. Setting **Page offset** on
  the file (Details, in the admin file list) to the number of front-matter
  pages makes the contents list, the page box and the search results quote
  the printed numbers instead. Everything stored — a member's place, a mark,
  a `?page=` link — stays in PDF pages, so an offset can be corrected later
  without moving anyone's place; front matter itself shows no number, and
  the reader displays the PDF page alongside while an offset is set.
- **When a browser can't draw the pages** — pdf.js needs a fairly current
  browser engine, and an older phone can open a PDF perfectly well without
  being able to run the library that draws one. The reader says so plainly
  and offers the book in the browser's own PDF viewer, at the page you were
  on, rather than showing an error. The offline screen behaves the same way.
- **Reading text size** — A− and A+ beside a hymn's words and in the EPUB
  reader's bar, remembered per device. The moment anybody discovers a hymn is
  too small to read is while they are looking at it, in a pew, which is not
  when somebody goes hunting through a settings page — though it is under
  **Reading** in `/profile/settings` as well. An EPUB is scaled as a
  percentage so the book's own headings and verses stay in proportion rather
  than all collapsing to one size. A scanned PDF is left out: its pages are
  pictures, and the reader has zoomed them from the start. Present mode keeps
  its own separate size, because a projector across a hall and a phone in a
  hand are never the same answer.
  - **It works offline too.** The offline screen reads the same setting and
    can change it, since a hall with no signal is exactly where the size
    matters and there is no settings page to reach.
- **The screen stays on** while a book or a hymn is open, so a phone doesn't
  dim halfway through the second verse. It's released as soon as you leave the
  page or switch away from the app — nothing here keeps a screen on in the
  background — and it can be turned off under **Reading** in
  `/profile/settings`. Some browsers don't offer this at all, and there the
  screen behaves as it always has.
- **Read aloud** — speaks the current page or section with a voice and speed
  picker, advancing through the book on its own. **It stops when the app is
  minimised**: browsers suspend speech for a backgrounded page, and no
  setting here can override that. A scanned PDF with no text layer has
  nothing to read and will simply do nothing.
- **Marks** — highlight selected text, bookmark a spot, and attach a note to
  either, all listed in a sidebar that jumps back to where each was made.
  Marks are per member and private to them.
- **Your place is kept** — reopening a book returns to where you stopped,
  stored per account (not per device), so it follows you between phone and
  desktop. Signed-out readers can still open a public book; nothing is saved.
- **Opening a book a second time is cheap** — a hymnal is tens of megabytes
  that never change, and it used to arrive again in full every time somebody
  looked up a hymn. Now the browser keeps its copy and only asks whether it
  is still current, which comes back as a few hundred bytes; the book itself
  is read off the device. Access is still checked on every open, so this
  costs nothing in control: a member who loses access is refused on their
  next open exactly as before. Its contents list — the hymn numbers and
  titles, which are read out of the PDF's bookmarks and are the slow part of
  a book's page — is remembered on the device too, for a month, and re-read
  from scratch whenever the file is replaced.

### How file access actually works

Every file the app links — the reader, the Download button, audio players,
podcast enclosures — is served by `/api/files/[id]/content`, which checks
access on **every request** against the live session. Nothing links Bunny's
CDN directly any more.

That matters because a CDN URL is permanent and unauthenticated. It can't be
revoked, it works for anyone who has ever been sent it, and it can't express
a rule this app relies on: whether a file is public depends on its series'
`memberOnly` flag, which an admin can change at any time. Serving through the
app means flipping that flag takes effect on the next request rather than
never.

Two things still need doing in the Bunny dashboard, because code can't do
them:

1. **Turn on Token Authentication** for the storage pull zone (Pull Zone ->
   Security) and put the key in `BUNNY_STORAGE_TOKEN_AUTH_KEY`. Until then
   the pull zone still answers anyone who knows a file's URL — the app has
   stopped handing those URLs out, but ones already shared keep working.
2. **Optionally, set up the public podcast zone** (all four
   `BUNNY_PUBLIC_STORAGE_*` / `BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME`
   vars). This is a **separate storage zone**, not an edge rule on the
   private one: a private file simply isn't in it, so there's no path to
   guess and no rule that can be quietly deleted later. Never point it at
   the same storage zone. Left unset — the default — podcast audio streams
   through the app route instead, which is safer but uses your app's
   bandwidth rather than Bunny's edge.

### Publishing a podcast episode

Publishing to the podcast feed is **per file and opt-in**: a "Not in
podcast" / "In podcast" button on audio files in `/admin/files`. Ticking it
copies that file into the public zone; the feed lists an episode only once
that copy has actually landed, so it can never advertise a URL that 404s.
The button reads "Podcast pending" when the intent is set but the file isn't
mirrored — either the copy hasn't finished, or something currently
disqualifies it.

A file leaves the public zone automatically when it stops qualifying:
marked members-only, unpublished, hidden, scheduled out, expired, trashed,
or moved into a series that is itself members-only, unpublished, hidden or
trashed. Flipping the cause back restores it without re-ticking anything,
because the admin's intent is stored separately from the mirror's state.

Two things to be clear about:

- **Publishing a podcast episode isn't reversible the way the rest of this
  app's access control is.** Un-publishing removes it from the feed and
  deletes the public copy, which stops *new* downloads — but listeners'
  apps have already fetched the file, and nothing can recall that. This is
  inherent to podcasting, which is exactly why it's opt-in per file.
- Existing audio was **not** back-filled when this was introduced. Before,
  every audio file in a public series was implicitly a public episode with
  nobody opting in; those feeds will be empty until someone ticks the
  episodes they actually want published.

Limits worth knowing: a **highlight of selected text only works in a PDF**.
An EPUB's pages live in an iframe the reader library owns, and the selection
inside it isn't readable from the surrounding page — so marking in an EPUB
saves a bookmark at the current position rather than pretending to capture
text it can't see.

Reading still needs a connection. The caching above makes a re-open cheap,
not free: the browser has to ask whether its copy is current before it may
use it, which is what keeps access checks immediate — so with no signal at
all a book won't open. That is a different thing from a downloaded video,
which plays with the network off. A very large PDF (over 48 MB) also keeps
streaming in pieces as it always did, since waiting for the whole file
before the first page appears would be the worse trade.

Stepping by contents entry is as good as the book's own contents. A PDF
whose bookmarks were never added has nothing to step through, and an EPUB
that packs several hymns into one section file steps by section rather than
by hymn — there is no ordering for anchors inside a document to do better
with.

## Auth

Access is decided from **two** independent checks — by default both must
pass, but `AUTHORIZATION_MODE` can relax that to either one alone:

```
authenticated with Auth0
  ↓  member of an approved Auth0 organization   (org_id claim, ID token)
  ↓  email ACTIVE in AuthorizedEmail            (PostgreSQL, via Prisma)
  ↓  application access
```

| Org member | Authorized email | Result under `BOTH` | Result under `EITHER` |
| --- | --- | --- | --- |
| no | no | DENY | DENY |
| no | yes | DENY | ALLOW |
| yes | no | DENY | ALLOW |
| yes | yes | ALLOW | ALLOW |

**How the two checks combine** is set by the `AUTHORIZATION_MODE` environment
variable:

| `AUTHORIZATION_MODE` | Org member | Authorized email | Who gets in |
| --- | --- | --- | --- |
| `BOTH` (default) | required | required | both, as above |
| `ORGANIZATION` | required | ignored | any approved organization member |
| `ALLOWLIST` | ignored | required | anyone on the list |
| `EITHER` | sufficient alone | sufficient alone | either one, as above |

Unset or unrecognised resolves to `BOTH` — a typo must never be the thing that
opens a door, and there is no value that switches both checks off. In
`ALLOWLIST` or `EITHER` mode the app also stops sending `organization` on the
login request: in `ALLOWLIST` mode Auth0 would otherwise reject non-members
before the app's own check ran, making the mode a no-op; in `EITHER` mode it
would be worse, since it would block the personal-account path entirely
before that person ever got a chance to be let in on their allowlist entry
instead. Both results are recorded on every refusal regardless of mode, so an
administrator can see what would happen under a stricter setting. A relaxed or
reshaped mode is stated in a banner on `/admin/authorized-emails` rather than
left to whoever remembers the variable.

`EITHER` is the "personal account or organization account" mode: someone who
is a member of an approved organization signs in on that alone, and someone
who isn't — a personal Google account, say — still gets in with an ACTIVE
allowlist entry, with neither required of the other. It needs one additional
Auth0 dashboard setting beyond what the other modes need: this Application's
**"Type of Users"** set to **"Both"**, under Application → **Login
Experience** — without it, Auth0 itself still insists on an organization even
when the app stops asking for one, and the personal-account path never
becomes reachable.

**Inviting a single guest without relaxing the mode for everyone** — an
`AuthorizedEmail` row can be individually flagged **`organizationExempt`**
("Guest" in `/admin/authorized-emails`, toggled with the "Make guest" /
"Require organization" button). An ACTIVE, exempt row is checked before
`AUTHORIZATION_MODE`'s own rule and always lets that one address in,
organization or not. This is the narrower fix for "I want `BOTH` for
everyone, but need to let in one guest speaker who isn't in our
organization" — `EITHER` mode answers a different question ("should anyone
on the allowlist skip the organization check"); the exempt flag answers
"should *this specific person*." A suspended exempt row is still refused —
the flag waives the organization check, not the allowlist's own ACTIVE
status.

A guest has to sign in through **`/auth/guest`** rather than the normal Log
in button, and this is not optional: when an organization is required and
configured, `/auth/login` names it on the authorization request, so Auth0
turns a non-member away at the identity provider — before the callback, and
so before the allowlist (and their exempt row) is ever consulted. The guest
route starts the identical login with the `organization` parameter omitted,
which is the only way their request survives long enough to be judged on the
exempt row. It grants nothing on its own: `authorizeIdentity` still decides,
and an address without an ACTIVE exempt row is refused exactly as before. It
404s when no organization is required, since the normal login already omits
the parameter in that case. Like `EITHER` mode, it needs the Auth0
Application's "Type of Users" set to "Both" (Login Experience tab).

The route also has its own master switch, **closed by default**: the "Guest
sign-in link" toggle at the top of `/admin/authorized-emails`, backed by a
one-row `AuthSettings` singleton (`isGuestLoginEnabled()` /
`setGuestLoginEnabled()`) rather than an env var, so opening it for an
invited guest and closing it again once they're done needs no redeploy —
just a click. Closed, `/auth/guest` 404s identically to the "no organization
required" case, so the response itself never reveals that a guest path
exists; `/access-denied` only offers the link once it's actually open, so a
guest who tried the normal button and lands there isn't pointed at a dead
link.

- **Organization** — `AUTH0_ORGANIZATION_ID` is a comma-separated list of
  accepted organization ids, so a deployment isn't limited to one. With
  exactly one configured (and `BOTH`/`ORGANIZATION`/`EITHER` mode), the app
  sends it as `organization` on the authorization request, so Auth0 refuses
  non-members at the identity provider (a personal Google account never
  reaches the callback with a usable token). With two or more configured, that
  parameter is left out instead, which is what makes Auth0 show its own
  organization picker rather than assuming one (needs "Prompt for
  Organization" turned on for this Application in the Auth0 dashboard).
  Either way, `isOrganizationMember()` re-checks the `org_id` claim of the
  verified ID token server-side against the same list. The parameter we
  send — or the choice made at Auth0's prompt — is a request; the claim is the
  proof. Nothing about membership is ever taken from a query string, header,
  or anything else the browser controls.
- **Allowlist** — `AuthorizedEmail` in PostgreSQL, managed at
  `/admin/authorized-emails`. Emails are stored trimmed and lowercased behind
  a unique index, so casing and whitespace can't produce a second row or slip
  past a lookup.
- **Where it's enforced** — `getCurrentUser()`, which every server-rendered
  page and API request already funnels through. Both checks run there on
  every request, so **removing an email takes effect on that person's next
  request**; an already-issued session cookie buys nothing. `User.authorized`
  is kept in step with the answer so the existing queries that read it stay
  correct.
- **Registration** — an Auth0 Pre-User-Registration Action calls
  `POST /api/auth/registration-check` (bearer secret, 5s timeout, fails
  closed) so an unauthorized address can't create an account at all. The
  Action holds a URL and a secret, never database credentials, and the
  endpoint answers with nothing but `{"allowed": true|false}` — it never
  returns any part of the list. See `auth0-actions/README.md`.
- **Refusals** — every rejected login, signup, or request from a revoked
  session lands on `/access-denied`, which shows one plain message and never
  a raw 400, a `CallbackHandlerError`, an Auth0 stack trace, or a Prisma
  error. The two callback errors that look alarming — an organization
  rejection, and `Missing state cookie` — are *expected* when someone tries a
  personal account; they're caught by the SDK's `onCallback` hook and turned
  into that page. State, nonce, and CSRF validation are untouched.
- **No session survives a refusal** — the SDK writes its session cookie after
  the `onCallback` hook returns, so `src/proxy.ts` strips it from any response
  redirecting to `/access-denied`. That is what makes "no application session
  is created after a failed authorization" true rather than merely intended.
- **Attempts are recorded** — see Access attempts below.
- Emails listed in `ADMIN_EMAILS` are adopted into `AuthorizedEmail` on first
  use (as a visible, suspendable row rather than an invisible exception), so a
  brand-new deployment has a way in. They still have to be organization
  members: this is a source for the allowlist, not a bypass of the model.

## Admin CMS (`/admin`)

- **Content management** — categories (with drag/position/type-to-reorder),
  series, videos (direct upload via TUS + import from an existing Bunny
  Stream library), and files (small uploads or link-by-URL for larger
  files hosted directly in Bunny).
  - **Files can be picked in bulk.** Each one gets its own title box,
    pre-filled with the filename minus its extension and editable before
    uploading — only the extension is stripped, since reformatting
    underscores or capitalisation is guessing at what someone meant to call
    it. Rows can be removed before starting, and more files added to a queue
    already listed.
  - They upload **one at a time, not as one batch**: the server's size cap
    is per request, so batching would make the limit worse, not better. A
    file the server rejects reports against its own row and the rest carry
    on; successful rows clear and failures stay put with the reason, so a
    partly-failed batch is retried without re-picking everything.
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

- **Automatic transcription** — **Transcribe it for me**, beside the
  transcript box on a video. Transcripts have been hand-typed since they
  shipped, which in practice means most videos have none and the search that
  reads them finds nothing.
  - It **queues rather than transcribes**: an hour of audio takes minutes,
    which is longer than a request may live. A scheduled job takes one video
    per run, so a backlog drains over successive runs instead of one request
    being killed halfway. An attempt that dies leaves the video in RUNNING;
    anything stuck there for half an hour is queued again by the next run.
  - It needs a **speech-to-text service**, named by `TRANSCRIBE_API_URL`.
    Any service taking a multipart POST with a `file` field and answering
    `{ "text": ... }` works — hosted, or a Whisper server on a machine in the
    office, in which case no audio leaves the building. Unset, the button is
    refused and says so.
  - The audio sent is the video's **MP4 rendition**, passed through this
    server rather than the service being pointed at a media URL: those URLs
    are signed and short-lived, and handing a third party a key to the library
    is a different thing from handing it one file. A video with no MP4
    rendition says so rather than failing obscurely, and a file over the
    service's size limit is refused here — with the size, in a sentence —
    rather than by somebody else's server.
- **Comment moderation** (`/admin/comments`, needs `moderate_comments`) — a
  queue of every reported and/or hidden comment, scoped to a moderator's own
  categories/series unless they hold a site-wide `moderate_comments` grant
  (or are `ADMIN`). "Hide" removes a comment from public view without
  deleting it; "Delete" is permanent, same as the existing per-comment
  delete action.

- **Downloads** (`/admin/downloads`, needs `manage_plugins`) — who may
  download (any member, or named groups/people), where the button appears
  (web, installed app, or both), and the suggested per-device storage cap.
  Which *videos* may be downloaded is set per category/series/video on their
  own edit pages. See Downloads above.

- **Who can sign in** (`/admin/authorized-emails`, needs `manage_users`) —
  the email allowlist: add, search, suspend/reinstate, and remove, with who
  added each address and when. Paginated. Refuses to remove the last active
  address, which would otherwise lock everyone out of the admin area. Named
  for the question it answers, to keep it distinct from **Members & roles**
  (`/admin/users`) beside it — that page is accounts, roles, editor grants,
  and pending login attempts, and its Grant/Revoke buttons write to this
  list, which is the one the app actually checks. Also shows the active
  `AUTHORIZATION_MODE` and its banner when relaxed or reshaped from the
  default `BOTH`.
  - Any address can be flagged **Guest** (`organizationExempt`), letting that
    one person in on an ACTIVE entry alone, without organization membership —
    a "Make guest" / "Require organization" button per row. See Auth above.
  - A **"Guest sign-in link"** card at the top toggles `/auth/guest` open or
    closed, off by default. It has to be open before a guest link is any use
    to anyone: the normal Log in button still names the organization and
    turns a non-member away before this list is ever checked.

- **Access attempts** (`/admin/access-attempts`, needs `view_audit_log`) —
  refused logins, signups, and requests from revoked sessions: when, email,
  provider, attempt type, which of the two checks failed, and the reason.
  Paginated server-side with search by email and filters by reason and date,
  a mark-reviewed action, and a prune button. No credential material of any
  kind is stored — no tokens, codes, or passwords — and records are pruned
  after 90 days by the daily cron.

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
- **Most looked-up hymns** answers the question a hymn list can't: what does
  this congregation actually sing? Counted when a hymn is really opened — its
  own page, a book opened at its number, or put on the projector — and named
  by the book's indexed contents, so a whole-book hymn reads as itself rather
  than as its book.
  - Counted **in the browser**, not when a page renders: hovering a link
    prefetches it, so a server-side count would largely be a count of mice.
    The honest cost is the other direction — a blocked request means an
    opening goes uncounted — which is the right way round for a number
    nothing depends on.
- **Export CSV** downloads the same top series, videos and hymns for the
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

- **Bunny's Stream iframe embed does support postMessage control**, via
  Player.js (`play()`/`pause()`/`seek()`, and `play`/`pause`/`timeupdate`/
  `ended` events). Nothing in the app uses it yet — the items below still
  work the way they did before it was found.
- **Android pausing playback on minimize can't be fixed from outside the
  iframe.** The attempt: listen via Player.js for a pause while
  `document.hidden`, then call `play()` again. Tested on a real device —
  playback still stops. The likeliest cause is the browser refusing a
  `play()` that originates from a hidden document with no user activation,
  which is squarely what its autoplay policy blocks. It also fails
  silently, since Player.js's `play()` is a fire-and-forget postMessage and
  any rejection inside the iframe never reaches the parent page. Anything
  that could plausibly work has to own the media element rather than talk
  to someone else's iframe — i.e. play Bunny's MP4 (the signed URL the
  Downloads plugin already builds) through this app's own `<audio>`, which
  is how web audio players get background playback. That's a real
  architectural change and is still not guaranteed: the MP4 carries a video
  track, so the browser may treat it as video and suspend it anyway.
- **Watch progress** is a heartbeat-based approximation, not frame-accurate:
  progress is inferred from elapsed time while the page is open rather
  than a precise scrub position.
- **Up next autoplay** has the same shape: autoplay fires a timer based on
  the video's known duration rather than hooking a real "ended" event.
- **Chapters** too: clicking one reloads the iframe with a new `t=`
  start-time query param instead of calling Player.js's seek.
- **Sermon notes'** timestamp field is manually entered for the same
  reason (no live playback position read) — it's prefilled once from the
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
matching, share-link sharing rules and link validity, download inheritance
and audience/platform rules, and device-settings parsing. Prisma is mocked, so the suite needs no database.

GitHub Actions runs the type check, lint, that suite, and
`prisma validate` / `prisma format --check` on every pull request and every
push to `main` (`.github/workflows/ci.yml`). The schema check is why an
unformatted `schema.prisma` fails CI — run `npx prisma format` before
committing schema edits.
