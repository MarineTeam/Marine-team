# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **Uploaded files are no longer served by permanent, unauthenticated CDN
  links.** Every file the app links — the Download button, audio players, the
  book reader, podcast enclosures — now goes through
  `/api/files/[id]/content`, which resolves `canViewFile` against the live
  session on each request.
  - Previously the app linked Bunny's storage pull zone directly. Those URLs
    need no login, can't be revoked, and keep working for anyone they were
    ever sent to — so a file's **members-only flag protected the page it was
    listed on, not the bytes**. The check also re-tests the parent series or
    category, since a file inside a members-only series inherits that
    protection rather than carrying its own flag.
  - This matters beyond convenience: whether a file is public depends on its
    series' `memberOnly` flag, which an admin can change at any time. A
    static CDN path can't express a mutable rule; an app route re-evaluates
    it on every request.
  - **Two dashboard steps are still required, because code can't do them.**
    Enable Token Authentication on the storage pull zone and set
    `BUNNY_STORAGE_TOKEN_AUTH_KEY` — until then the zone still answers any
    URL already in circulation. And if you set the new optional
    `BUNNY_STORAGE_PUBLIC_PULL_ZONE_HOSTNAME`, that second zone must be
    restricted (edge rule or its own storage zone) to podcast audio, or it
    re-opens everything the token auth just closed.
  - Podcast enclosures default to the app route rather than a CDN URL. They
    stay anonymous-readable for public series — podcast apps can't log in —
    and stop the moment a series is marked members-only, which a permanent
    CDN link never would.
  - **A members-only audio file inside a public series was being listed in
    the public podcast feed.** `publishedNow()` gates
    published/hidden/scheduled/trashed but never audience, and the feed
    filtered only on mime type. Now excluded outright.
  - **Publishing to the podcast feed is now per-file and opt-in**
    ("In podcast" in `/admin/files`), where before every audio file in a
    public series became a public episode with nobody consenting. Opted-in
    audio is copied to an optional **separate public storage zone** — a
    distinct zone rather than an edge rule on the private one, so a private
    file simply isn't there to be found. The feed lists an episode only
    after that copy lands, so it can't advertise a URL that 404s, and the
    copy is removed automatically when a file or its series stops
    qualifying. Existing audio was deliberately not back-filled: publishing
    to a permanent public URL should be a decision someone makes on purpose.
  - Download filenames are built from the file's title with CR/LF, quotes
    and backslashes stripped: that title is admin-entered free text going
    into an HTTP header, so it's a header-injection vector left unchecked.
- **Two-factor authorization: Auth0 organization membership AND a PostgreSQL
  email allowlist.** Access is decided from two independent checks — being a
  member of an approved Auth0 organization, and having an ACTIVE
  `AuthorizedEmail` row. By default both are required and neither is
  sufficient alone; `AUTHORIZATION_MODE` and the per-address guest exemption
  below are the deliberate, admin-controlled exceptions to that. Neither
  check is ever read from anything the browser controls: membership comes
  from the `org_id` claim of the verified ID token, the allowlist from the
  database.
  - **`AUTHORIZATION_MODE`** selects how the two checks combine — `BOTH`
    (default, an AND: neither is enough alone), `ORGANIZATION`, `ALLOWLIST`, or
    the new **`EITHER`** (an OR: either check alone is enough — the "personal
    account or organization account" case, for a member with no organization
    at all to still get in on an allowlist entry). Unset or unrecognised means
    `BOTH`; no value disables both checks. In `ALLOWLIST` or `EITHER` mode the
    app stops sending `organization` on the login request, since Auth0 would
    otherwise refuse non-members before the app's own check ever ran. A
    relaxed or reshaped mode is shown as a banner on the Authorized emails
    screen rather than living only in an env var.
  - **Multiple organizations**: `AUTH0_ORGANIZATION_ID` now accepts a
    comma-separated list. With exactly one configured, the app still sends it
    as `organization` on the login request; with two or more, that parameter
    is omitted and Auth0's own organization picker (Application → Login
    Experience, "Prompt for Organization") lets the member choose instead of
    the app picking for them. Either way, whichever organization the member
    ends up with is re-checked server-side against the verified ID token's
    `org_id` claim — a picker choice made in the browser is never trusted on
    its own.
  - **Invite a guest without relaxing `BOTH` for everyone else**: any
    `AuthorizedEmail` row can now be individually flagged
    **`organizationExempt`** ("Guest" on the Authorized emails screen), which
    lets that one address in on an ACTIVE entry alone — organization
    membership isn't asked of them, while every other address still needs
    both checks. Narrower than `EITHER` mode, which relaxes the rule for every
    allowlisted address at once rather than one named guest.
    - A guest can't use the normal Log in button: it names the organization,
      so Auth0 refuses a non-member at the identity provider before the
      allowlist is ever consulted. The new **`/auth/guest`** route starts the
      identical login with the organization parameter omitted, which is the
      only way a guest's request survives long enough to be judged on their
      exempt row — it grants nothing by itself, `authorizeIdentity` still
      makes the actual decision.
    - `/auth/guest` has its own switch, **closed by default**: a "Guest
      sign-in link" toggle at the top of the Authorized emails screen, backed
      by a database row (`AuthSettings`) rather than an env var, so opening it
      for one guest and closing it again afterward takes effect immediately
      with no redeploy. Closed, the route 404s indistinguishably from "no
      organization is required here," so the response never reveals that a
      guest path exists at all.
  - **Access attempts now record Auth0's own reason for a callback refusal**,
    not just a generic "Auth0 refused the login." Several of the SDK's error
    types (an organization rejection among them) leave their own top-level
    message at a fixed default and put the actual `error`/`error_description`
    Auth0 sent back in a separate field the app wasn't reading; both are now
    captured and shown on the Access attempts screen and in the admin
    notification email.
  - Both checks run inside `getCurrentUser()`, the choke point every
    server-rendered page and API already goes through, so **revocation
    applies to existing sessions** — remove an email and that person is
    refused on their next request rather than whenever their cookie expires.
  - Emails are stored trimmed and lowercased behind a unique index, and
    `normalizeEmail()` is the only way one is ever compared or written, so
    casing and whitespace can't create a duplicate row or dodge a lookup.
  - New **Authorized emails** admin page (`manage_users`): add, search,
    suspend/reinstate, remove, with who added each address and when. Refuses
    to remove the last active address, which would lock everyone out.
  - An Auth0 **Pre-User-Registration Action** (source in `auth0-actions/`)
    calls the new `POST /api/auth/registration-check` so unauthorized
    addresses can't create accounts. The Action holds a URL and a shared
    secret, never database credentials; the endpoint answers with nothing but
    a boolean, compares the secret in constant time, and fails closed on
    timeout, misconfiguration, or any answer that isn't a clear yes.
  - Every refusal now lands on a friendly `/access-denied` page instead of a
    raw 400, `CallbackHandlerError`, Auth0 stack trace, or Prisma error. The
    organization-rejection and missing-state callback errors are handled as
    the *expected* outcomes they are for a personal account — state, nonce,
    and CSRF validation are untouched.
  - **No application session survives a failed authorization**: the SDK
    writes its session cookie after the `onCallback` hook returns, so
    `src/proxy.ts` strips it from any response redirecting to
    `/access-denied`.
  - Refused logins, signups, and requests from revoked sessions are recorded
    in `UnauthorizedAccessAttempt` — who was refused, which of the two checks
    failed, and why, with **no credential material of any kind**. Visible at
    the new **Access attempts** admin page (`view_audit_log`): paginated
    server-side, searchable by email, filterable by reason and date, with
    mark-reviewed and prune. Pruned after 90 days by the daily cron.
  - Administrators are emailed on a refusal, through the existing Resend
    integration. Abuse is bounded by an hour-long per-address cooldown and a
    ceiling of ten notification emails per hour, both counted in Postgres —
    the attempt is always recorded, only the emailing is throttled. No Redis
    is involved anywhere.

### Added

- **Present mode**: a hymn's words on the screen at the front of the room —
  one verse at a time, as large as it will go, white on black with a light
  option. **Present** on a hymn's page, or **Present this service** on a
  service plan, which then carries on into the next hymn of the order rather
  than sending whoever is driving back to a list between hymns.
  - Verses come from the shape the lyrics were typed in: a blank line
    separates them, and a block that names itself ("Chorus", "Refrain:") is
    that rather than a numbered verse, so the numbering skips it the way the
    printed book does.
  - A presenter's clicker is a keyboard — PageDown/PageUp move a verse, as do
    the arrows and the space bar — and the whole surface is a control, since
    whoever is driving is standing at a laptop and not looking at it. The
    chrome fades after three seconds and comes back on the first touch, key or
    nudge of the mouse.
  - The screen is held on (the same wake lock as the reader), text size and
    palette are remembered per device — the projector in the hall and the
    phone in your hand want different answers — and a hymn with no lyrics says
    so rather than showing an empty screen.
- **The storage figure counts books.** `/profile/downloads` showed a bar of
  how full the device was that counted videos only — while a saved hymnal is
  routinely the largest thing on the phone, sitting in the same cache out of
  the same allowance. One figure now covers both, with the split underneath
  and the browser's own quota beside it where the browser will say what it is,
  since the admin's cap is guidance and that quota is the limit that actually
  bites.
- **The offline shell's hand-copied constants are tested against their
  originals.** `public/offline.html` and `public/sw.js` stand alone with no
  bundle, so cache names, storage keys, URL prefixes, the icon set and the
  rule for reading a hymn number are all copied into them by hand — the right
  trade for those files, and the kind of duplication that rots quietly. A
  rename now fails in CI rather than emptying somebody's offline screen in a
  service. The hymn-number copy is checked by running it, not by comparing
  text, and every branch of it has a case.
- **Service plans** (new plugin): staff publish the hymns for a service, in
  the order they'll be sung, and members open the list at `/services` and tap
  straight through to each one. Built in `/admin/services`, gated on
  `manage_files` — a plan is a list of files, so whoever may arrange the
  library may arrange a service.
  - An item is either a **hymn that is its own file** (it opens at its lyrics)
    or a **number inside a whole-book hymnal**. For the second the admin
    writes down the number that goes up on the board, and the page it lands on
    is resolved from the book's own contents when a member opens it — the
    browser reading that PDF is the only thing that knows which page hymn 214
    is, so `/books/<id>?hymn=214` is the hand-off.
  - Deliberately not a playlist: those are a member's own, hold videos and
    have no date. A plan is one copy everyone in the building opens, drafted
    unpublished until the order is settled.
  - A hymn unpublished, or one a signed-out visitor can't open, still shows in
    the order rather than leaving a gap — it is being sung either way — and
    says why it doesn't open.
- **Hymns are searchable, by their words.** Search covered categories, series
  and videos; files were never looked at, so the hymnal was unfindable by name
  and its lyrics unfindable at all. Both are searched now, and a lyrics hit
  comes back with the line it matched — nobody looks a hymn up by a title they
  can't remember, they look it up by the line they can. Only files with a page
  of their own are listed (a hymn's lyrics, a book's contents); an audio
  handout is a row under its series, and search already finds the series.
- **A hymn can be favourited.** Series and videos have been favouritable from
  the start and files never were, so the one thing members look up most
  couldn't be kept in a list. Same button, same plugin, listed under
  **Hymns & books** on the favourites page.
- **The screen stays on while a book or a hymn is open.** A phone dimming
  halfway through the second verse is the most ordinary failure this app has.
  The wake lock is dropped the moment the page is hidden or the reader closed
  — nothing keeps a screen on in the background — and it is switchable per
  device under **Reading**, beside the swipe setting. Browsers without the API
  behave exactly as they did.
- **Type the hymn number, land on the hymn.** The number that goes up on the
  board is not the page it is printed on, and until now the reader only took
  pages — so finding hymn 214 meant scrolling a contents list while everyone
  else was standing up to sing. A **Hymn** box now sits in the reader's
  contents bar, on a book's contents page, and on the offline screen; a
  number and Enter is the whole interaction, and phones get a numeric keypad
  for it.
  - The number is read from the book's own contents entries — "214", "1.
    Holy, Holy, Holy", "Hymn 45", "No. 12", "#7" — and only from the *front*
    of an entry. A number anywhere else belongs to the title, and following
    one would send someone to the wrong hymn while looking like it worked.
  - Offered only where a book actually numbers its entries, so a contents
    list of chapter titles doesn't grow a box with nothing to type in it, and
    a number the book doesn't list says so rather than jumping somewhere
    close.
- **EPUBs save for offline too, not just PDFs.** The asymmetry was an
  accident of which reader came first. A saved EPUB stores its bytes, its
  contents (read out of those bytes with epub.js rather than fetched again)
  and the library needed to render it, and the offline screen opens it the
  way the in-app reader does: scrolling, chapter by chapter, with the arrow
  keys and the swipe registered inside the frame epub.js owns and the current
  chapter named in the bar. Where a PDF can fall back to the browser's own
  viewer, an EPUB can't — no browser renders one — so that case offers the
  file for whatever reading app the device has.
- **A file can be replaced without becoming a different file.** A re-scanned
  hymnal used to have to be uploaded as a *new* file, which quietly stranded
  everything that referred to the old one: members' saved places and marks,
  the `?page=` links on its contents list, its podcast episode, and every
  copy saved to a phone for offline reading. **Replace the file** (in a
  file's Details panel in `/admin/files`) points the existing row at new
  bytes instead, so all of that follows the book.
  - Two ways in, because the app's own upload runs through a serverless
    function capped at 4MB: a small file straight from the panel, or an
    object already uploaded to Bunny Storage, chosen from the same listing
    the importer uses.
  - The replacement must be **the same kind of book** — a PDF for a PDF, an
    EPUB for an EPUB. Every saved place is in that format's own terms (a page
    number, a CFI), so swapping one for the other would turn them all into
    nonsense while looking like an ordinary edit.
  - The new bytes go to a **new storage path**, never over the old one: a
    pull zone caches by URL, so overwriting in place would leave the CDN
    serving last year's scan. The old object is left in Bunny — replacing is
    destructive enough, and storage has no undo — where the importer lists it
    for whoever wants to clean it up.
  - The cover and hymn count are cleared, since they described the previous
    file; re-run **Generate covers**. A mirrored podcast episode is
    re-copied. Devices holding the book offline see **Update available** on
    their next visit, which is exactly what that check was built for.
- **A book that can't be drawn is handed to the browser instead of showing an
  error.** pdf.js needs a fairly current browser engine — an older phone can
  open a PDF perfectly well and still not be able to run the library that
  draws one — and until now that surfaced in the reader as a raw error
  message. The reader now offers the book in the browser's own PDF viewer, at
  the page you were on, with the technical reason kept in small print for
  whoever gets the support message. The offline screen already did this; the
  two now behave the same way.
- **A saved book says when it is out of date.** A copy on a device was
  previously kept forever, however much the book had moved on. Each saved
  book now records what it was when it was saved — a PDF's ETag, a hymnal's
  fingerprint over its hymns and lyrics — and the book's page and
  `/profile/downloads` compare that against the current one, offering
  **Update** when they differ and saying so when the book is no longer
  available to that account.
  - The check costs almost nothing: a PDF is asked with a conditional request
    for **one byte**, so an unchanged book answers with a bodyless `304` and a
    changed one with a single byte and its new validator. A hymnal asks the
    same route it was saved from for its fingerprint alone (`?probe=1`).
  - Nothing is ever removed on the strength of that answer. A book leaves a
    device when the person holding it says so, not because a request failed.
- **The bottom bar is yours to arrange, and it survives losing the
  connection.** The row of icons in the installed app is the only navigation
  it has, so what belongs there depends on why you opened it. **Bottom bar**
  in `/profile/settings` adds, removes and reorders up to five destinations —
  Home, Search, New, any section of the library, your own lists, Profile —
  stored per device with the other device settings and applied the moment you
  change it. A device that has chosen nothing keeps exactly the bar it had.
  - A choice is stored as hrefs and re-resolved against what you may
    currently see, so a category that is unpublished, or a page whose plugin
    is switched off, drops out of the bar instead of leading nowhere.
  - **The icons are drawn offline too.** They used to vanish the moment the
    connection did: the offline screen had no navigation at all. The app now
    leaves a snapshot of the bar where the offline screen can find it, and
    that screen draws the same icons — with the sections that have something
    saved on this device shown in full colour.
- **Hymnals can be saved to the device and read with no connection at all.**
  "Save for offline" on a book's page stores the PDF in Cache Storage, the
  same place a downloaded video lives, and the book then opens from its own
  icon in the bottom bar with the network off — contents list, hymn numbers,
  page turning and all.
  - Saving stores three things, because all three are needed to actually read
    a hymn offline: the file's bytes, the book's **contents list** (read out
    of the bytes just downloaded rather than fetched again), and a copy of
    **pdf.js**, since the offline screen is a static page with no application
    bundle to draw pages with. The library is copied out of `pdfjs-dist` at
    install/build time into `public/pdfjs` (`scripts/copy-offline-pdfjs.mjs`)
    and fetched once, when the first book is saved.
  - The offline screen is now a small reader: the books saved on this device,
    each book's contents with the page numbers printed in it, and a page view
    with swipe, arrow keys and zoom. Where a browser can't draw the pages
    itself, the book is handed to that browser's own PDF viewer at the right
    page rather than showing a blank sheet.
  - Tapping an icon offline shows what is saved under it — the Hymnals icon
    shows the hymnals, including books filed under a series inside that
    section — and a link straight to `/books/<id>` or `/read/<id>` opens that
    book. Saved books are listed and removable in `/profile/downloads`
    alongside saved videos.
  - The **in-app** reader also survives the connection dropping while it is
    open: the service worker answers `/api/files/<id>/content` from the saved
    copy, but only after the network has actually failed and only for a book
    this device was deliberately given — a cached copy never stands in for an
    access check that said no.
  - **A hymn-per-file book saves too** — one whose hymns are separate files
    rather than one PDF. There is no document to store for a book like that,
    so what's kept is the list of hymns with their lyrics
    (`/api/offline/hymnal/[seriesId]`, behind the same view and plugin checks
    as the page itself), and the offline screen renders them: hymns in
    printed-page order under their group headings, a find box that matches a
    number, a title or a line of the lyrics, and **Back**/**Next** stepping
    hymn to hymn. A link straight to `/hymns/<id>` opens that hymn. Lyrics
    are corrected and added long after a scan would have stopped changing, so
    this one offers **Update** as well as Remove. Hymns with no lyrics text
    aren't saved — offline they would be blank — and the button says how many
    were actually kept.
  - Gated by the existing **Downloads** plugin, per category like the rest of
    it, and by the member choosing to save a particular book.
- **Books are cached on the device that reads them, and hymns can be stepped
  through.** Several changes that matter to the same person: someone
  finding hymn 214 in a scanned hymnal on a phone, on a Sunday.
  - **A book is no longer re-downloaded every time it is opened.**
    `/api/files/[id]/content` serves PDFs and EPUBs as `private, no-cache`
    rather than `private, no-store`, and passes a conditional request
    (`If-None-Match`/`If-Modified-Since`) through to Bunny — so a re-open
    revalidates and comes back as a bodyless `304`, with the file itself
    read from disk. `no-cache` is the deliberate choice over a `max-age`:
    the browser must still ask, so **`canViewFile` runs against the live
    session on every open** and losing access still takes effect on the next
    one. Everything that isn't a book keeps `no-store`.
  - A PDF small enough to hold (48 MB) is now fetched **whole, in one
    request**, instead of in the byte ranges pdf.js asks for as it goes. A
    ranged response is a poor thing for a browser cache to hold, so the
    ranged path is what made re-opens cost full price; larger scans keep it,
    since there the wait for the whole file before the first page would be
    worse. The fetch is aborted if the reader is closed while it runs.
  - **A book's contents list is remembered per device.** Reading it means
    opening the PDF and resolving every bookmark to a page — for a hymnal,
    hundreds of lookups, and the slowest thing the book's page does. The
    resolved list is now cached in `localStorage`, tagged with the file's
    size so a replaced book is read afresh, and dropped after a month. Both
    the book's contents page and the reader's own Contents panel use it.
  - **"Back" and "Next" step by hymn, not by page.** A bar along the bottom
    of the reader names the entry being read and moves to the neighbouring
    one, driven by the book's own contents — the PDF's bookmarks or the
    EPUB's navigation document. Back goes to the start of the hymn being
    read before it goes to the previous one, the way a track skip does.
    Readers place their own locations on a comparable number line
    (`ReaderHandle.order`), so this works for a PDF's page numbers and an
    EPUB's CFIs without the chrome learning either.
  - In a **hymn-per-file** book, whose hymns are separate files rather than
    one PDF, a hymn's page now carries the same arrows, stepping in the
    order the book's list shows and skipping hymns the viewer can't open.
- **Swipe left and right to turn the page** in the PDF reader, with the
  arrow keys (and PageUp/PageDown) doing the same on a desktop. The gesture
  commits to an axis before it claims a touch, so scrolling still scrolls,
  and a second finger is a pinch-zoom rather than a page turn. Zoomed in past
  the width of the screen — where a sideways drag is how you pan — the page
  pans instead. On by default; switched off from the reader's toolbar or
  **Reading** in `/profile/settings`, per device like the other settings
  there.
- **Page offset for a book PDF** — a scanned hymnal usually opens with a
  title page and several pages of table of contents before printed page 1,
  so the PDF's page 55 is the book's page 45. A **Page offset** on the
  file's Details panel in the admin file list says how many pages of front
  matter come first, and the book's contents list, the reader's page box and
  its search results then quote the number printed in the book rather than
  the PDF's own. Set per book by an admin, because nothing in a PDF says
  where its printed numbering starts; left at 0, every book reads exactly as
  it did before.
  - What's *stored* stays in PDF pages — where a member got to, a saved
    mark, a `?page=` link — so correcting an offset later re-labels the
    numbers without moving anyone's place in the book. Pages of front matter
    have no printed number and show none, and while an offset is set the
    reader shows the PDF page alongside so the file can still be navigated
    by it.
- **Downloads** (new plugin): members can save a video to their device and
  watch it with no connection. The file is streamed into Cache Storage and
  served back by the service worker — range requests included, so seeking
  works offline — which lets an ordinary `<video>` play with the network off.
  Requires **MP4 Fallback** on the Bunny Stream library, since HLS segments
  can't be played offline. The download endpoint reads Bunny's own per-video
  `hasMP4Fallback`/`availableResolutions` rather than assuming a fixed
  rendition exists — enabling MP4 Fallback only affects uploads made
  afterward, so older videos routinely have neither — and serves the highest
  resolution at or under `BUNNY_STREAM_DOWNLOAD_HEIGHT` (720p default), with a
  specific reason (no fallback generated yet, nothing at or under the
  resolution cap, the CDN rejected the request, or the file's genuinely
  missing) instead of one catch-all "no downloadable file" message.
  - **Granular control over what can be downloaded**: a three-way
    Inherit/Allow/Block setting on every **category**, **series**, and
    **video**, resolved most-specific-first and falling back to the nearest
    ancestor category that has an opinion. Three states rather than a checkbox
    so "not set" keeps following its parent as that parent changes. Edited on
    the category and series pages, and as a cycling per-row button on
    `/admin/videos`.
  - **Who can download**: `/admin/downloads` chooses any member, or only named
    permission groups and individuals. Admins always can.
  - **Where**: the same page limits downloading to the web, the installed app,
    or both — offline files belong to the PWA, and a church can say so.
  - Downloading can never widen access: the API resolves `canViewVideo` first,
    so it only ever narrows what a member could already watch.
  - `/profile/downloads` becomes real: whether downloads are available to you
    (and why not, if not), the Wi-Fi-only vs mobile-data preference, storage
    used against the admin's suggested cap, and per-video **Play offline** and
    **Remove**. The list is per device and never reaches the server, and
    self-heals when the browser silently evicts a cached file.
  - **Downloaded videos are now reachable with no network at all.** Opening
    the site with no connection — including the installed PWA's own cold
    launch — used to hit the browser's native "you're offline" page before
    the app (and its downloaded-video list) ever loaded. A static, data-free
    `offline.html`, reading nothing but the same localStorage index and Cache
    Storage this feature already writes, is now precached by the service
    worker and served for any navigation whose network request fails. The
    rest of the site is still deliberately never cached.
- **Share links**: revocable, tracked links to a series or video, opened at
  `/s/[token]`. A link can be **public** (anyone holding it, no account
  needed) or **private** to named emails, in which case each recipient is
  emailed their link and must log in as that address to open it — forwarding
  it on hands over nothing. Optional expiry of 1–365 days.
  - Any logged-in member can share, including gated content, but a link only
    **overrides** a members-only or viewer restriction when the sharer ticks
    the override box — which needs the new **`share_content`** capability,
    grantable site-wide or scoped to a category/series. That opt-in is how one
    guest is let into a members-only series without loosening it for anyone
    else; left unticked, the link opens only for people who already have
    access. The capability is permission to override, never an automatic one.
  - Optional **password** on any link (public or private), asked for at
    `/share/unlock/[token]` before the link redeems. Stored as a salted scrypt
    hash, never returned to a client or included in the recipient email, and
    protected by a per-link lockout after ten wrong guesses in 15 minutes.
  - Redemption records the open and stores the token in an httpOnly cookie so
    access survives navigating around the site, but the cookie holds tokens
    only: every request re-validates them against the database, so a revoke
    takes effect immediately even for a browser that already holds the link.
  - A "Share a link" panel on any series/video page the member may share,
    listing their existing links for that content; the full list at
    `/profile/shared-links`; and `/admin/share-links` for admins and
    `share_content` holders, listing **every** link with its owner, filters,
    and an audited Revoke. A dead link lands the recipient on
    `/share/unavailable`, which says whether it was revoked, expired, or
    meant for a different account.
  - Gated by a new **Share links** plugin. Revoking is never gated, so
    turning the plugin off can't trap someone with links they can't switch
    off.
- **Profile area** (`/profile`): the member's account hub, the same on the web
  and in the installed PWA, with a Profile tab added to the mobile bottom nav
  badged with the unread count.
  - **Inbox** — every notification the site has sent, persisted as
    `Notification` rows alongside each push/email send, so it's a complete
    record even for a member who never allowed push or who read it elsewhere.
    Mark one or all read, open the linked content, delete individually or
    clear the lot.
  - **Shared links** and **Downloads** sections, the latter holding the
    Wi-Fi-only vs mobile-data preference (live now) ahead of offline playback
    itself.
  - **Settings** split into per-device and per-account: **Theme**
    (System/Light/Dark), **Language** (English only for now), **Autoplay**,
    **Default playback speed**, and the download-network choice are stored in
    localStorage per device; display name, notification frequency, and email
    opt-in stay on the account.
  - **Delete account** — type your own email to confirm, then the `User` row
    and everything cascading from it is removed and the browser is logged
    out. Refused for the last remaining admin, which would otherwise leave
    nobody able to grant access again.
- **Theme setting**: dark mode is now a class on `<html>` rather than only the
  OS preference, applied by a blocking inline script before first paint (no
  flash of the wrong theme) and kept in step with the OS and other tabs while
  the page is open. The `prefers-color-scheme` media query remains as the
  no-JS fallback.
- **Per-page metadata and Open Graph images**: video, series, category, and
  speaker pages now set their own title, description, and social-preview
  image (the content's own thumbnail/cover/photo) instead of sharing one
  static site-wide `<title>`, so links shared to chat apps and social media
  preview with the real title and image. A page for content the current
  visitor can't view (member-only) falls back to a generic "Members Only"
  title and no image, matching what the page body itself already withholds
  from a non-viewer.
- **Breadcrumbs and structured data (JSON-LD)**: video, series, and category
  pages show a visible Home / parent / current-page breadcrumb trail
  (replacing the old bare "← back" link on video and, when unlocked,
  category pages), built from the same items that also feed an invisible
  `BreadcrumbList` for search engines. Video pages additionally emit a
  schema.org `VideoObject` (title, description, thumbnail, upload date,
  duration, embed URL) for Google's video rich results. All skipped for
  content the current visitor can't view.
- **Timestamp/clip sharing**: video pages read `?t=<seconds>` and start
  playback there — taking priority over the viewer's own resume position —
  and a new "Share at" mm:ss field builds that link. Each chapter also gets
  its own 🔗 copy-link button using its own known timestamp.
- **Book reader** (new plugin): PDF and EPUB files now open in an in-app
  reader at `/read/[fileId]` instead of only being downloadable, with a
  **Read** button beside Download wherever files are listed.
  - **Contents** from the PDF outline or EPUB navigation document, nested
    and clickable; **search across the whole book** with surrounding
    context; **read-aloud** with a voice and speed picker that advances
    through the book on its own; and **marks** — highlights, bookmarks and
    notes, listed in a sidebar that jumps back to each one.
  - **Your place is kept per account**, not per device, so a book picks up
    where you left off across phone and desktop. Signed-out readers can
    still open a public book; nothing is stored for them.
  - Reader bytes serve through `/api/files/[id]/content`, which checks
    access on every request — see the file-access change below.
  - Two limits stated up front: **read-aloud stops when the app is
    minimised** (browsers suspend speech for a backgrounded page — the same
    class of limit as video background playback), and **highlighting
    selected text works in PDFs only**, since an EPUB's pages sit in an
    iframe whose selection the surrounding page can't read; marking an EPUB
    saves a bookmark at the current position instead.
- **Cast to TV**: a Chromecast button next to Download, gated the same way,
  reuses the signed MP4 endpoint already built for the Downloads plugin as
  its cast source — the default Chromecast receiver needs a direct file, not
  an iframe embed. AirPlay needed no code: Safari already shows its own
  AirPlay control for any actively-playing `<video>`, iframe or not. (The
  Chromecast piece hasn't been checked against a real Chromecast device yet
  — worth confirming on a preview deploy before relying on it. Bunny's own
  embed also turns out to support both natively via `chromecast=true` and
  `disableAirplay` query params, found after this was already built and
  not yet reconciled with it.)
- Corrected a claim repeated throughout this codebase's comments and docs:
  **Bunny Stream's embed does expose a postMessage API**, via Player.js.
  Nothing uses it yet, so no behavior changed — watch progress, Up next,
  chapters, and sermon-note timestamps all still work as they did. An
  attempt to use it to stop Android pausing playback on minimize (catch
  the pause while the page is hidden, call `play()` again) was tested on a
  real device and **does not work**; it's been removed, with the reasoning
  written up in FEATURES.md so it isn't tried again the same way.

### Changed

- **Files can be uploaded in bulk**, each with its own title box pre-filled
  from the filename (extension stripped, and nothing else rewritten — the
  admin can see and edit it before uploading). Files go up one at a time
  rather than as a single batch, because the upload size cap is per request:
  batching would tighten the limit rather than raise it, and this way a file
  the server rejects reports against its own row while the rest continue.
  Successful rows clear, failures stay listed with the reason.
- Shared links can now be **deleted** as well as revoked, in both the member's
  own list and the admin panel. Revoking keeps the record and marks it dead;
  deleting removes the row. Either way the link stops working, since the token
  only resolves through that row.
- Autoplay is now a per-device setting rather than a hidden localStorage flag
  owned by the "Up next" panel: turning it on there and in
  `/profile/settings` is the same switch, and it now also starts the video
  itself, not just the roll-on to the next episode.
- The **Profile** nav link no longer depends on the Profiles plugin — that
  plugin still governs display names, but the profile area itself now holds
  the inbox, shared links, and account settings, which a member always needs.

### Fixed

- **Fixed a production `P2037` "too many connections" error** caused by
  runtime traffic sharing a direct database connection sized for a
  migration's brief burst, not sustained serverless concurrency.
  `prisma/schema.prisma`'s `datasource` block now splits `url` (pooled, used
  by every runtime query) from `directUrl` (direct, used only by
  `prisma migrate deploy`/`db push`) — read from `POOLED_DATABASE_URL` and
  `DATABASE_URL` respectively. That naming is asymmetric on purpose: Vercel's
  Prisma Postgres marketplace integration injects `DATABASE_URL` itself and
  marks it read-only in the dashboard, so rather than fight that,
  `DATABASE_URL` is read as the direct connection Vercel already provides,
  and the pooled string is supplied by hand as the new `POOLED_DATABASE_URL`.
  See the README's Deployment section for the exact values to use.

## [1.5.0] - 2026-07-30

### Added

- **Query Monitor**: a WordPress-Query-Monitor-style debug bar shown at the
  bottom of every page — query count/time, a per-query breakdown, page
  render time, and process memory. Gated by two switches, both required: the
  `QUERY_MONITOR_ENABLED` environment variable (case-insensitive, a redeploy
  to flip) and a DB-backed admin switch toggleable right on
  `/admin/query-monitor` with no redeploy needed. Renders for logged-in
  `ADMIN` users only, even when both are on, and updates on every
  client-side navigation rather than freezing at whichever page
  triggered the last full load.

### Fixed

- **Bunny thumbnails**: four `<Image>` usages (admin video list, admin
  thumbnail manager, the "Up next" panel, and playlist detail) were missing
  `unoptimized`, routing signed, short-lived Bunny thumbnail URLs through
  `/_next/image`'s optimizer, which could re-fetch the origin URL after the
  signature expired and surface as a broken image. All Bunny-thumbnail
  `<Image>` usages are now `unoptimized`, and `next.config.ts`'s now-unused
  `remotePatterns` is removed. Also fixes `playlist-detail.tsx` (a client
  component) recomputing its thumbnail URL client-side with no signing
  token on re-render; the URL is now signed server-side and passed down.

## [1.4.0] - 2026-07-29

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
- **Scheduled + targeted announcements**: an announcement can now have a
  `publishAt`/`expiresAt` window and an audience (guests/members/everyone),
  on top of the existing `active` toggle.
- **Shareable playlists**: a playlist can be made "shareable", letting
  anyone with the link view it read-only at `/playlists/[id]` without
  logging in.
- **Analytics date range + CSV export**: `/admin/analytics` gained a
  7/30/90-day range picker and a CSV/JSON export of the same top-series/
  top-videos data.
- **Cron to reconcile stuck video processing**: a new daily
  `/api/cron/sync-video-status` job polls Bunny for any video still stuck
  in `PROCESSING` and applies the same status/duration/thumbnail sync the
  admin's manual "Sync from Bunny" button does.

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
