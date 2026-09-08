# Prompt: port Marine Team to PHP + MySQL/MariaDB for ordinary shared hosting

Paste everything below the rule into a fresh coding-agent session that has this
repository checked out. It is written to the agent doing the port. The current
Next.js code stays untouched; it is the reference implementation the port is
measured against.

---

## The job

Re-implement this application — the whole of it, as described in `README.md`
and `FEATURES.md` — as a PHP application backed by MySQL or MariaDB that a
church volunteer can install on ordinary shared hosting: upload a zip through
the host's file manager or FTP, open the site in a browser, follow an
installer, done. No shell, no Node, no Composer on the server, no daemons, no
Redis. Everything an administrator will ever need to do after that happens in
the browser, because on shared hosting the browser is all they have.

Three things the current app hard-wires to one vendor become **swappable
services**, chosen during install and changeable later from the admin area
without touching code:

| | Options | Notes |
| --- | --- | --- |
| Sign-in | Auth0, OpenID Connect, local accounts | Local works immediately. Auth0 and OIDC need the site reachable over HTTPS first. |
| Video | bunny.net Stream | Videos upload straight from the browser to the provider. |
| Email | Resend, SMTP, PHP `mail()` | If your host blocks outbound HTTPS, SMTP is usually the one that works. |

Any of them can be changed later under **Admin → Services**. Switching runs the
new service's connection test first, and refuses the switch if it fails.

And the port gets **WordPress-like plugin and theme functionality**: a
`plugins/` directory of self-contained packages with a header, an activation
hook, and access to a documented hook API; a `themes/` directory of template
and stylesheet overrides; both managed from the admin area, both installable
from a zip. A plugin that throws while loading is deactivated automatically
rather than taking the site down — on shared hosting there is no shell to
disable it from.

## Read first

Do not start writing PHP until you have read these. They are the
specification; this prompt tells you what changes and what must not.

- `README.md` — how every feature works and, more importantly, *why* it is
  shaped the way it is. The reasoning carries over even where the mechanism
  doesn't.
- `FEATURES.md` — the feature list, with the URL map under "Where things are".
- `prisma/schema.prisma` — 90 models, 32 enums. Column comments are load-bearing.
- `prisma/migrations/0_init/migration.sql` and the migrations after it — the DDL
  as it actually exists; a starting point for the MySQL schema.
- `src/lib/plugins.ts`, `src/lib/capabilities.ts` — the plugin registry (31
  bundled features) and the fixed capability list.
- `src/lib/current-user.ts`, `src/lib/authorization.ts`,
  `src/lib/identity-linking.ts`, `src/lib/auth0.ts`, `src/proxy.ts`,
  `auth0-actions/README.md` — the access model.
- `src/lib/bunny.ts`, `src/lib/email.ts`, `src/lib/sms-send.ts`,
  `src/lib/push.ts`, `src/lib/transcribe.ts`, `src/lib/video-feeds.ts`,
  `src/lib/sheets/` — every external integration, each a plain `fetch` against
  a REST API. None of them uses an SDK worth keeping.
- `.env.example` — the complete configuration surface. Every variable here
  becomes either an installer question, an Admin → Services setting, or goes
  away because it was Vercel-specific.
- `vercel.json` — the scheduled jobs.
- `src/lib/*.test.ts` (62 files) — pure logic, specified by test. Port the
  tests first and the functions until they pass.
- `public/sw.js`, `public/offline.html` — the service worker and the standalone
  offline shell. Both are already framework-free and port nearly verbatim.
- `CHANGELOG.md` — for the decisions that were reversed and why.

The app is roughly 74,000 lines of TypeScript across 88 pages, 213 API routes,
137 components and 121 library modules, with 62 test files. Plan for that; see **Work plan** at
the end.

## Non-negotiables

These describe the host the port must run on. Treat each as a test case.

1. **PHP 8.2 minimum**, 8.3 and 8.4 supported. Use nothing newer than 8.2.
   Required extensions: `pdo_mysql`, `mbstring`, `json`, `openssl`, `ctype`,
   `fileinfo`. Optional, with the feature that needs it saying so: `curl`
   (falls back to `allow_url_fopen`), `zip` (plugin/theme upload from a zip),
   `gd` (logo resizing), `bcmath` or `gmp` (Web Push VAPID signing), `intl`.
2. **MySQL 8.0+ or MariaDB 10.6+**, InnoDB, `utf8mb4`. One database, one
   user, possibly shared with other applications: every table name takes a
   configurable prefix (default `mt_`). Nothing may require `SUPER`, event
   scheduler, stored procedures, triggers, or `FILE` privileges.
3. **Apache with `mod_rewrite` via `.htaccess`** is the primary target;
   LiteSpeed behaves the same. Provide an nginx snippet in the docs. The app
   must also work installed in a **subdirectory** (`example.org/church/`):
   every URL is built from a detected base path, never hard-coded from `/`.
4. **No shell after upload.** No Composer on the host: third-party PHP
   libraries are vendored into the release zip by the maintainer. No `exec`,
   `shell_exec`, `proc_open`, `popen`, `system` anywhere in the codebase — many
   hosts disable them, and the code must not care.
5. **No long-lived processes.** Requests are killed at 30–60 seconds; assume
   `max_execution_time=30` and `memory_limit=128M`. Every job is time-budgeted
   and resumable. No WebSockets; live chat polls, exactly as it does now.
6. **Small upload limits.** Assume `upload_max_filesize=2M` until the installer
   measures otherwise. Anything larger than that limit is uploaded in chunks or
   goes straight from the browser to the provider. Video bytes never pass
   through PHP.
7. **Outbound HTTPS may be blocked**, or `allow_url_fopen` may be off. The
   installer probes this and says so; the services that don't need it (local
   sign-in, SMTP, `mail()`, local file storage) keep working.
8. **No HTTPS at first.** A site is often set up on a temporary hostname before
   its certificate exists. Local sign-in, video, and email all work over plain
   HTTP; Auth0 and OIDC are offered but refuse to be activated until the site
   is reached over HTTPS (redirect URIs must be `https://`).
9. **A writable directory is the only state outside the database.** Default
   `storage/` inside the install; the installer offers to put it above the
   document root when the host allows and protects it with `.htaccess` when it
   doesn't. Sessions, cache, logs, the installer's `config.php`, plugin state
   markers and chunked-upload temp files live there. Nothing else is written
   to disk at runtime except files the local storage backend owns.
10. **Errors never show a stack trace to a visitor.** Every uncaught Throwable
    renders one plain page and writes a log line; admins read logs at
    `/admin/logs` because they have no other way to.

## The compatibility contract

The port is a re-implementation behind the **same URLs, the same JSON shapes,
the same cookie names, and the same `localStorage` and Cache Storage keys**.
Not a resemblance — the same. This is what lets the following keep working
without a rewrite: the offline shell (`public/offline.html`), the service
worker, an installed PWA on somebody's phone, a Roku channel built on
`/api/tv/feed.xml`, podcast apps subscribed to `/series/[slug]/podcast.xml`,
calendar apps subscribed to `/api/calendar/[token]/marine-team.ics`, share
links people have already sent, and any integration holding an `/api/v1` key.

- Every page path under `src/app/**/page.tsx` and every route under
  `src/app/**/route.ts` exists in the port at the same path with the same
  methods, status codes, and response bodies. The one permitted difference is
  under `/auth/*`, which grows routes for local accounts.
- `.ics`, RSS, podcast, sitemap, JSON-LD and Open Graph output are
  byte-compatible where a consumer might care (feeds), and equivalent where
  only a person reads them (metadata).
- `public/sw.js`, `public/offline.html`, `public/manifest.json` and the
  vendored viewers (`pdfjs`, `epubjs`, `tesseract`, as
  `scripts/copy-offline-viewers.mjs` lays them out) ship as static files at
  the same paths. `/api/manifest` still renders the manifest from branding.
- Keep `marine-device-settings`, `marine-locale`, the bottom-nav snapshot key,
  the offline indexes, and the Cache Storage paths (`/offline-video/<id>.mp4`,
  `/offline-book/<id>.pdf`, `/offline-hymnal/<id>.json`,
  `/offline-calendar/snapshot.json`) exactly as they are.
- Ids stay strings. The existing rows use 25-character cuids; the port stores
  ids as `VARCHAR(32)` (`ascii_bin`) and generates new ones as ULIDs or
  cuid-style strings. Never integers: a data import from a running deployment
  must be a copy, not a remap.

## Architecture

**No full-stack framework.** Laravel and Symfony are the wrong shape for this
target: they need Composer on the host, they pin PHP versions aggressively,
and a plugin author on shared hosting cannot follow them. Build a small core
— router, PDO wrapper, templates, sessions, CSRF, validation, HTTP client,
hooks, plugin and theme loaders, service registry, migrations, jobs — and keep
it small enough to read in an afternoon. WordPress is the reference for the
*shape* of the plugin API, not for its code quality: use namespaces, typed
signatures, prepared statements everywhere, and no globals beyond one
container.

Vendored third-party PHP is allowed from a short list, each pure PHP and
shipped in `vendor/` inside the release zip: `phpmailer/phpmailer` (SMTP),
`minishlink/web-push` and its dependencies (Web Push, optional at runtime —
if its extension requirements aren't met the feature reports itself
unavailable), `firebase/php-jwt` (OIDC/Auth0 token verification, Google
service-account JWTs). Development-only, never shipped: PHPUnit, PHPStan,
PHP-CS-Fixer. Composer is a maintainer tool for building the zip.

**Layout** (the installer offers to move `app/`, `storage/`, `plugins/` and
`themes/` above the document root; the default keeps everything in one tree
with `.htaccess` denying direct access to anything but `public/`):

```
public/                    document root
  index.php                front controller: bootstrap, route, render
  .htaccess                rewrite everything to index.php; deny dotfiles
  assets/                  css/, js/, icons, sw.js, offline.html, manifest.json
  vendor-js/               pdfjs/, epubjs/, tesseract/, tus/ — prebuilt, committed
app/
  bootstrap.php            loads config, opens DB, registers error handling
  Core/                    Router, Db, View, Session, Csrf, Http, Hooks, Cache, Jobs, Migrator, Log
  Services/                the service registry and the provider interfaces
    Auth/{Local,Auth0,Oidc}Provider.php
    Video/BunnyStreamProvider.php
    Email/{Resend,Smtp,PhpMail}Provider.php
    Files/{LocalDisk,BunnyStorage}Provider.php
  Modules/                 one directory per core feature (Library, Access, Search, Trash, Audit, Branding, ...)
  Migrations/              0001_init.sql … numbered, applied in order
  Templates/               core templates a theme may override
  Lang/en.php, es.php
plugins/                   bundled and third-party plugins, one directory each
themes/                    default/ plus any installed theme
storage/                   writable: config.php, sessions, cache, logs, plugins/, uploads/, tmp/
vendor/                    vendored PHP libraries (shipped)
install/                   the installer; refuses to run once storage/installed.lock exists
bin/migrate.php, bin/cron.php   for the minority of hosts that do have a shell; never required
```

**Templates** are plain PHP files rendered through a small `View` with an
escaping helper (`e()`), layouts, partials, and a theme-aware resolver
(active theme → parent theme → `app/Templates`). Output is escaped by
default; raw output is an explicit call that lints loudly.

**JavaScript is plain ES modules, no bundler, no framework.** A plugin or
theme author on shared hosting cannot run a build, and neither should the
core need one: a file edited over FTP is the file the browser gets. Every
interactive piece attaches to server-rendered HTML through `data-*`
attributes (progressive enhancement) and each lives in its own module under
`public/assets/js/`. The React components in `src/components/` are the
behavioural spec for these modules — port what they do, not how. The heavy
client logic (reader, presenter, offline shell, chunked upload, live chat
polling, watch-progress heartbeat, form builder, rota builder) is the bulk of
this work; the offline shell and the pure `src/lib` modules the browser uses
(`device-settings`, `nav-tabs`, `outline`, `sms`, `book-contents`,
`toc-nav`, `reader-cache`, `offline-*`) are already framework-free and port
with light edits. Expose one small public API for plugins: `MT.hooks`
(`on`/`filter`, mirroring the PHP side), `MT.api` (`fetch` with CSRF header
and base path applied), `MT.settings` (device settings read/write).

**CSS is hand-written**, organised by component, painted entirely through the
custom properties `lib/branding.ts` already derives (`--accent`, `--panel`,
…) so branding and themes stay a form submission. No Tailwind at runtime and
no compiled CSS the host can't regenerate. Reproduce the current look: the
sidebar, header, bottom tab bar, dark/light with the pre-paint init script,
the standalone-PWA chrome, the television shell, presenter mode.

**Sessions** live in the database (`sessions` table), not in the host's
shared `/tmp`: httpOnly, `SameSite=Lax`, `Secure` when the request is HTTPS,
id regenerated on login, absolute and idle lifetimes. The allowlist and role
are re-checked on every request from the database (one cached query per
request), so **revocation still applies to existing sessions** exactly as
`getCurrentUser()` guarantees today.

**CSRF**: a per-session token, required on every state-changing request;
JSON routes accept it as an `X-CSRF-Token` header, which `MT.api` sends.
`/api/v1` and the cron endpoint authenticate by bearer token and are exempt.
Webhook receivers (none today) would be too.

**Rate limits and locks stay in the database**, as they are now — there is no
process state to count in. `SELECT … FOR UPDATE` inside a transaction keeps
the event-capacity, group-waiting-list, rota-cover and television-token
claims correct under concurrency; keep every one of those transactions.

**Errors**: a global handler converts every Throwable into a logged line
(with request id, user id, route, and the plugin on the stack if any) and one
of two responses — a JSON `{error, code}` for API routes, matching
`errorResponse()` in `src/lib/api-guard.ts` including which errors carry
detail and which are answered generically, or a plain HTML page. Debug mode
(`config.php`, off by default) adds the trace for admins only. Logs rotate by
size; `/admin/logs` tails and downloads them; `/admin/system` shows PHP
version, extensions, limits, disk, database version, the writable check, and
the outbound-HTTPS probe result.

**Caching** is per-request memoisation (the port of React's `cache()`
pattern) plus an optional file cache in `storage/cache/` for the handful of
site-wide reads every page does — branding, plugin states, nav, the active
announcement — invalidated by the writes that change them. Correctness must
never depend on the cache being warm or present.

## Install and upgrade

`/install` is a wizard the front controller serves until
`storage/installed.lock` exists, after which it 404s.

1. **Requirements**: PHP version and extensions, `storage/` writable, a
   rewrite test (the wizard fetches a known pretty URL from itself and reports
   if `mod_rewrite` isn't doing its job), detected upload and execution
   limits, outbound HTTPS probe (a HEAD to a known host through curl or
   streams), HTTPS detection for the current request (including
   `X-Forwarded-Proto`, trusted only when the admin ticks "behind a proxy").
   Failures are explained in words a volunteer can act on ("ask your host to
   enable the `zip` extension").
2. **Database**: host, name, user, password, table prefix. Test the connection
   and the privileges the migrations need before writing anything. Then write
   `storage/config.php` (a PHP file returning an array: database, an
   `app_key` generated with `random_bytes`, base URL, storage path, debug flag)
   and run the migrations — one file per request with a progress bar and a
   resume, so a slow host's timeout can't leave the schema half-applied
   (`schema_migrations` records each file only after it commits).
3. **Site and administrator**: site name, short name, brand colours (the
   `BrandSettings` defaults), the site's language default, timezone, and the
   first administrator as a **local account** — email and password. This local
   admin exists even if Auth0 or OIDC is chosen next; it is the recovery path.
4. **Services**: for each of Sign-in, Video, Email, Files, pick a provider and
   fill its fields, with a **Test** button per provider. Local sign-in, local
   file storage and `mail()` are preselected so the wizard can finish with
   nothing external configured; each other provider can be "set up later".
   Auth0 and OIDC are greyed out with the reason until the wizard is reached
   over HTTPS.
5. **Finish**: write `installed.lock`, print the cron line for the host's
   control panel (see **Scheduled jobs**) and say what happens if they don't
   add it, and land on `/admin`.

**Upgrades** are the same zip uploaded over the old files (FTP or file
manager), then a visit to `/admin/update`, which detects a newer code version
than the database's, enters maintenance mode (a `storage/maintenance` file
that the front controller honours for everyone but the admin performing it),
runs pending core and plugin migrations with the same one-per-request
resumable runner, and clears the cache. Also offer **upload a release zip** on
that page for hosts with the `zip` extension: extract to `storage/tmp`, verify
the manifest and checksum, swap directories, migrate.

**Backups**: `/admin/tools` exports the database as `.sql.gz` written in PHP
table by table (no `mysqldump`), streamed so a large site doesn't hit the
memory limit, and offers a download of `storage/uploads` as a zip in parts.

## The services layer

A **service** is a slot the core depends on through an interface; a
**provider** is one implementation. The `services` table holds one row per
slot: `slot`, `provider`, `config` (JSON, secrets encrypted with `app_key`
using `sodium` or `openssl` AES-256-GCM), `updated_at`, `updated_by`.
Providers are registered in code — core ones in `app/Services/`, more through
the `services.providers` hook so a plugin can add a Vimeo video host or a
Mailgun email provider. Each provider declares:

```php
interface ServiceProvider {
    public static function slot(): string;            // 'auth' | 'video' | 'email' | 'files' | …
    public static function id(): string;              // 'auth0', 'smtp', …
    public static function label(): string;
    public static function configSchema(): array;     // fields: key, label, type, secret?, help, required?
    public static function requiresHttps(): bool;
    public static function requiresOutboundHttps(): bool;
    public function __construct(array $config);
    public function test(): TestResult;               // ok | fail(message for a person)
}
```

The admin UI for every provider is generated from `configSchema()`; secrets
are write-only fields that show "set" and never echo the value.

**Admin → Services** shows each slot, its active provider, when it was set and
by whom, and a **Change** action. Changing walks: pick provider → fill fields
→ **Test** → **Switch**. The switch is refused unless the test passed
*in this same submission* (the test result is signed and short-lived, so a
stale pass can't be replayed after editing a field). A provider whose
`requiresHttps()` is true can't be switched to unless the current request is
HTTPS; one whose `requiresOutboundHttps()` is true shows the probe result
beside it, which is what makes "if your host blocks outbound HTTPS, SMTP is
usually the one that works" a thing the screen says rather than the manual.

Slots the port has, and what "test" means for each:

- **auth** (Local, Auth0, OIDC) — see below. Beyond the automated test, the
  switch *away* from the current provider completes only after the switching
  admin has signed in through the new one: the new provider is enabled in
  trial mode for that admin's session alone, they finish a login in a second
  tab, and the switch commits. No admin can lock themselves out by typing a
  wrong client id.
- **video** (bunny.net Stream) — `GET /library/{id}` with the API key must
  succeed; the CDN hostname must answer; if a token-auth key is set, a signed
  thumbnail URL must return 200 while an unsigned one returns 403.
- **email** (Resend, SMTP, `mail()`) — Resend: an authenticated API call
  (`GET /domains`) succeeds and `from` is on a verified domain. SMTP: connect,
  STARTTLS/TLS as configured, EHLO, AUTH, then send a test message to the
  admin. `mail()`: the function exists and a test message with a six-digit
  code is sent to the admin; the switch commits only when the admin types the
  code back, because `mail()` returning true proves nothing about delivery.
- **files** (Local disk, Bunny Storage) — this fourth slot is not in the
  table above and is added because the port can't exist without deciding
  where PDFs, audio and other uploads live. Local disk is the default and
  works with no account anywhere: files under `storage/uploads/` (never under
  the document root), streamed by the app route with Range support. Bunny
  Storage is the current behaviour, with the private pull zone, token
  authentication, and the optional public podcast zone. Test: write, read
  back, and delete a probe object. Each `file_assets` row records which
  backend holds it; switching applies to new uploads and an admin tool
  migrates existing files in batches.

The remaining env-driven integrations become settings groups on the same
page, same generated forms, same test button, but optional and not
install-time: **SMS** (Twilio or JSON webhook), **Web Push** (VAPID pair,
generated in PHP with a button), **Transcription** (URL, key, model, max
bytes), **Google Sheets** (service-account JSON; the JWT is signed with
`openssl_sign` RS256 and exchanged for an access token, replacing
`google-auth-library`), **Video import** (YouTube API key, Vimeo token),
**API keys** stay where they are. `AUTHORIZATION_MODE`, `ADMIN_EMAILS`,
`AUTH0_ORGANIZATION_ID`, `CRON_SECRET`, `BUNNY_STREAM_DOWNLOAD_HEIGHT`,
`QUERY_MONITOR_ENABLED` all move into settings with the same semantics
(`ADMIN_EMAILS` becomes "bootstrap administrators", still granting `ADMIN` on
login). Every place the current app says "set `SOME_VAR`" now names the
setting and links to it.

## Sign-in providers

Keep the identity model: a `users` row per person, `user_identities` rows
keyed by `sub` with `provider`, `email`, `email_verified`. `decideLinking()`
from `src/lib/identity-linking.ts` ports as-is and stays the only way an
incoming identity is attached to a member: sub first; a never-seen sub may
attach by email only when the provider verified it; an unverified match is
refused indistinguishably from any other denial. `authorizeIdentity()` and
the four `AUTHORIZATION_MODE`s port with their fail-closed defaults; the
organisation check simply reports "not applicable" for providers without
organisations, which under `BOTH` means the allowlist decides. Refusals
record `unauthorized_access_attempts` with the same reasons, the same
once-an-hour dedupe, the admin email on first refusal, and the 90-day prune.
`/access-denied` stays one plain sentence.

- **Local accounts** (`provider = 'local'`). Passwords with
  `password_hash(PASSWORD_ARGON2ID)` where available, bcrypt otherwise; a
  rehash on login when the algorithm improves. Routes: `/auth/login` (form),
  `/auth/logout` (POST, CSRF), `/auth/register` (only when self-registration
  is on — off by default; invitation is an ACTIVE row in `authorized_emails`,
  which is what the registration form checks, so the Pre-User-Registration
  Action's job survives), `/auth/verify/[token]`, `/auth/reset` and
  `/auth/reset/[token]` (via the email service; a reset link is single-use,
  expires in an hour, and a request for an unknown address answers exactly
  like a known one). Login throttling is per account and per IP, in the
  database. Password change and a "sign out everywhere" button live on
  `/profile/settings`. Optional TOTP second factor for admins is welcome but
  not required by this prompt.
- **Auth0**. Authorization Code with PKCE against the tenant's OIDC
  endpoints, the `organization` parameter sent under the same rules
  `src/lib/auth0.ts` documents (exactly one configured and required → send it;
  zero, several, or `ALLOWLIST`/`EITHER` → omit it), the `org_id` claim of the
  verified ID token as the only proof of membership, `/auth/guest` with its
  database-backed master switch and 404 behaviour, the callback-error
  recording including the `error`/`error_description` Auth0 sent back, and
  the registration-check endpoint for the Pre-User-Registration Action
  (`auth0-actions/` stays valid; update its README for the new setting names).
  ID tokens are verified against the tenant's JWKS (cached in the file cache
  with the `kid` rotation handled), `nonce` and `state` checked, and the
  session cookie is only written after `authorizeIdentity` says yes — the
  thing `src/proxy.ts` exists to enforce is natural here because the app owns
  the cookie.
- **OpenID Connect** (generic). Issuer URL → discovery document → PKCE code
  flow → JWKS verification (RS256/ES256), `email`, `email_verified`, `name`,
  `picture` claims, an optional groups claim and value that stands in for the
  organisation check, and an optional logout endpoint. Tested against
  Keycloak, Authentik, Microsoft Entra ID and Google, with a note per
  provider in the docs (Google doesn't send `email_verified` for every
  account type; Entra needs the `email` optional claim).
- **Lockout prevention** is a rule, not a hope: the bootstrap local admin
  always exists; the trial-mode switch above; and a break-glass that needs no
  shell — creating an empty file `storage/enable-local-login` re-enables
  local sign-in for `ADMIN` accounts on the next request and shows a banner
  until it is deleted. Document it in `INSTALL.md` under "Locked out".

Auth0 and OIDC also require `APP_BASE_URL` to be HTTPS; the installer and
Admin → Services both refuse them otherwise and say why.

## Video

`VideoProvider` is the interface behind everything `src/lib/bunny.ts` does
for Stream: `create(title): id`, `browserUpload(id): {endpoint, headers…}`,
`get(id)`, `delete(id)`, `embedUrl(id, start?)`, `thumbnailUrl(id, file?)`,
`mp4Url(id, height)` with `probe`, `setThumbnail`, `addCaption`,
`deleteCaption`, `listLibrary()`, `mapStatus()`. Bunny Stream is the one
implementation and everything Bunny-specific in the current code is preserved
in it:

- **Upload straight from the browser** with TUS: PHP creates the placeholder
  (`POST /library/{id}/videos`), returns the presigned tuple —
  `sha256(libraryId . apiKey . expirationTime . videoId)` with a one-hour
  expiry, endpoint `https://video.bunnycdn.com/tusupload` — and the vendored
  `tus-js-client` streams the file. The API key never reaches the browser and
  the bytes never reach PHP. After the upload the browser calls
  `/api/admin/videos/[id]/sync-status`, as now.
- **Embed and thumbnail URLs** are signed per request when a token-auth key is
  configured: `sha256_hex(tokenAuthKey . videoId . expires)`, unsigned
  otherwise. The `t=` start parameter feeds resume, chapters and `?t=` links.
- **MP4 fallback** for Downloads and Cast follows `resolveMp4Source`: read
  `hasMP4Fallback` and `availableResolutions`, cache them on the video row,
  pick the highest at or under the configured height, and answer with the
  same four distinct reasons.
- **Captions** live in Bunny; **status sync** polls `PROCESSING` videos;
  **"import from the Bunny library"** lists what's there.
- `Video.source` (`BUNNY`, `YOUTUBE`, `VIMEO`) and the three players stay; the
  YouTube/Vimeo feed import is an integration, not a video *host*, and stays
  under Admin → Video feeds with its three-way sync rule intact.

## Email

`EmailProvider::send(Message)` where a message has `to`, `subject`, a plain
`text` body and an `html` body, and an optional `replyTo`. Everything that
sends — notifications, broadcasts (one row per recipient per channel, marked
as it goes, batch loop driven from the browser exactly as `broadcast-send.ts`
does), password resets, verification, the admin refusal alert, the `mail()`
confirmation code — goes through it. Providers: **Resend** (HTTPS API, as
`email.ts` does today), **SMTP** (PHPMailer: host, port, encryption
none/STARTTLS/TLS, username, password, from, timeout), **PHP `mail()`**
(from, optional `-f` sender; the docs are honest that deliverability depends
on the host's SPF and DKIM). Unconfigured email is a first-class state: sends
become recorded no-ops, the screens that need email say so, and local
sign-in's reset flow explains that an admin must set the password instead.

## Plugins

A plugin is a directory under `plugins/<slug>/` containing `plugin.php` with
a header block, the same idea as WordPress:

```php
<?php
/**
 * Plugin Name: Sermon notes
 * Slug:        sermon-notes
 * Version:     1.0.0
 * Description: Lets members keep their own timestamped notes on a video.
 * Author:      Marine Team
 * Requires PHP: 8.2
 * Requires App: 3.0
 * Provides:    (optional) auth|video|email|files — this plugin registers a service provider
 * Category Override: yes|no — whether it can be switched per category
 */
```

`plugin.php` returns (or registers) an object implementing:

```php
interface Plugin {
    public function boot(Hooks $hooks, Container $c): void;   // every request while active
    public function activate(Container $c): void;             // once, on activation: run own migrations
    public function deactivate(Container $c): void;           // on deactivation; must not drop data
    public function uninstall(Container $c): void;            // explicit "delete data" from the admin
    public function migrations(): array;                      // versioned SQL/PHP steps, prefix p_<slug>_
}
```

**Hooks** are the extension surface, `Hooks::on($name, callable, $priority)`
for actions and `Hooks::filter($name, callable, $priority)` for filters, with
`Hooks::do($name, ...$args)` and `Hooks::apply($name, $value, ...$args)` on
the core side. Every hook name is documented in `PLUGINS.md` with its
arguments and where it fires. The core must fire at least these, and the
bundled plugins must be implementable with them alone:

- lifecycle: `app.boot`, `app.request`, `app.shutdown`
- routing: `routes.register(Router)` — public, API and admin routes with
  middleware (auth, capability, CSRF, rate limit)
- access: `capabilities.register`, `content.can_view(bool, item, user)`,
  `user.resolved(user)`, `auth.refused(attempt)`
- content: `series.saved`, `video.saved`, `file.saved`, `*.published`,
  `*.trashed`, `*.restored`, `*.purged`, `content.search_sources`,
  `home.rows`, `related.items`
- UI: `nav.sections`, `nav.tabs`, `admin.menu`, `render.head`,
  `render.body_end`, `page.video.panels`, `page.series.panels`,
  `profile.sections`, `profile.settings`, `admin.dashboard.cards`
- services and settings: `services.providers`, `settings.register`,
  `plugin.category_override` (declares support)
- jobs: `jobs.register(Scheduler)` — name, interval, callable, budget
- i18n: `lang.catalogue(locale, array)`
- templates: `template.resolve(path)` and per-template `template.<name>.vars`

Plugins may add tables (own prefix, own migrations), routes, admin pages built
from the same layout and form helpers the core uses, settings groups,
capabilities, jobs, service providers, nav items, and translations. They may
read core data through the module services (`Library`, `Access`, `Users`,
…), never by reaching into another plugin's tables. Plugin JS is a plain
module under `plugins/<slug>/assets/`, served through a route that maps
`/plugins/<slug>/assets/*` to it with the right cache headers; plugin CSS
uses the same custom properties.

**The 31 features in `PLUGIN_META` become bundled plugins** in `plugins/`,
written against the public hook API and nothing else. That is not tidiness:
it is how you find out the API is complete. Bundled plugins are marked so in
the `plugins` table, cannot be deleted from the UI, and default to active on a
fresh install exactly as `ensurePluginsSeeded()` does now. Per-category
overrides (`plugin_category_overrides`, nearest-ancestor wins, fail-open when
a row is missing) stay a core facility available to any plugin that declares
it; `getPluginStates()` — all plugins resolved in two or three queries, once
per request — is the port's `PluginStates` service and the only way a page
asks. The query-monitor row keeps its special status: a `Plugin` row that is
not a plugin, excluded from the list.

The core keeps what is not a plugin today: the library, access, users and
permissions, search, trash, audit, branding, i18n, the profile shell, the
PWA and offline shell, services, jobs, plugins and themes themselves.

**Loading, and what happens when a plugin throws.** On each request the
loader reads the active list, orders it (bundled first, then by declared
dependencies, then name) and for each plugin:

1. writes `storage/plugins/loading.json` — `{slug, request_id, started_at}`;
2. `require`s `plugin.php` and calls `boot()` inside `try { … } catch
   (\Throwable $e)`. `ParseError`, `TypeError`, a missing class, an exception
   from a constructor — all land here;
3. deletes the marker.

Three things turn a failure into an automatic deactivation, each recorded on
the `plugins` row as `deactivated_reason`, `deactivated_at`, and the first
2 KB of the error, and each shown as a dismissible notice on every admin page
and in the plugin list:

- the `catch` above;
- a `register_shutdown_function` that checks `error_get_last()` for
  `E_ERROR`/`E_PARSE`/`E_COMPILE_ERROR`/`E_CORE_ERROR` while
  `$currentlyLoading` is set — memory exhaustion and the timeout both reach a
  shutdown function — deactivates that plugin, and renders the plain error
  page instead of a white screen;
- at the top of bootstrap, a `loading.json` older than 60 seconds from a
  different request id means a request died mid-load in a way nothing above
  caught (a hard kill, a segfault); the plugin it names is deactivated before
  any plugin loads.

Throwing from a **hook callback** after boot is contained rather than fatal:
the dispatcher catches, logs, counts it in the file cache, and the page
continues without that callback's contribution; ten failures in ten minutes
deactivates the plugin the same way. A plugin's own route throwing renders
the error page for that route only. Deactivation is a one-column write plus a
cache clear, and it emails the administrators once.

Two pages never load third-party plugins, so an administrator can always
reach them: `/admin/plugins` and `/admin/logs`. `/auth/*` loads only plugins
whose header says `Provides: auth`, and if that one fails, falls back to local
sign-in for `ADMIN` accounts with the reason on screen.

**Installing and updating** from the admin: upload a zip (needs `ext-zip`;
without it, the page explains the FTP route: unzip into `plugins/`, then
refresh the list), which must contain exactly one top-level directory with a
`plugin.php` whose header parses and whose `Slug` matches the directory; the
zip is extracted into `storage/tmp` and moved into place only after that
check. Activation runs `activate()` in a transaction where the migrations
allow it, and a throw there leaves the plugin inactive with the error shown.
Updating is uploading a newer version over the old; the loader notices the
version change and runs the new migrations on the next request under the
same resumable runner. Uninstall is separate from deactivate and is the only
thing that calls `uninstall()`. Only `manage_plugins` may do any of this.
Plugin code runs with the application's full privileges, like WordPress;
`PLUGINS.md` says so in its first paragraph.

## Themes

A theme is `themes/<slug>/` with `theme.json` (`name`, `slug`, `version`,
`parent?`, `author`, `screenshot`), `templates/` mirroring `app/Templates/`
paths to override any of them, `assets/` (`theme.css` is loaded after the
core stylesheet; `theme.js` after the core modules), an optional
`functions.php` that receives the same `Hooks` as a plugin, and an optional
`customizer.json` declaring settings (colour, image, text, select, toggle)
rendered under `/admin/appearance` and merged over `BrandSettings` — the
three brand colours, name, short name and logo are the base every theme
inherits. Resolution is child → parent → core; a missing template in a child
falls through, so a theme can override one partial. The **default theme**
reproduces the current interface and ships as `themes/default/`; other themes
are installed from a zip with the same checks as plugins. A theme whose
`functions.php` throws at load is switched back to the default with the same
notice a plugin gets. Template files are PHP and are rendered with the
`View`'s escaping helpers in scope; document the variables each core template
receives in `THEMES.md`, since that is a theme author's whole API.

## Database

Port the schema model for model. Naming is `snake_case` for tables and
columns (MySQL identifier case depends on the filesystem; don't gamble on
quoted PascalCase), and the import tool below maps names. Rules:

- `String @id @default(cuid())` → `VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin`.
- `DateTime` → `DATETIME(3)`, always UTC; `@updatedAt` → `ON UPDATE
  CURRENT_TIMESTAMP(3)`; `@db.Date` → `DATE`.
- Enums → `VARCHAR(32)` with the allowed values enforced in PHP (MySQL `ENUM`
  alterations rewrite the table).
- `Json` → `JSON` (MariaDB aliases it to `LONGTEXT` with a validity check;
  fine).
- `String[]` (`Category.tags`, `Series.tags`, `Video.scriptureRefs`,
  `PermissionGroup.capabilities`, `ApiKey.scopes`) → a `JSON` column *and*,
  where the array is queried, a join table kept in step by the module that
  writes it: `series_tags(series_id, tag)` for `/tags/[tag]` and search,
  `video_scripture_books(video_id, book)` for `/scripture/[book]`.
  `EventSeries.excludedDates` (`DateTime[] @db.Date`) → `JSON`.
- Text columns that hold markdown, transcripts, page text or lyrics →
  `MEDIUMTEXT`; `coverDataUrl` → `MEDIUMTEXT`.
- Case-insensitive comparisons come from the collation
  (`utf8mb4_unicode_ci`, which both engines have); `normalizeEmail()` still
  lowercases before write and compare so the unique index on
  `authorized_emails.email` means what it means now.
- Foreign keys with the same `onDelete` semantics as the schema (`Cascade`,
  `SetNull`), declared explicitly.

Postgres-only constructs and their replacements:

- **Trigram fuzzy search** (`pg_trgm`, `similarity()`): `FULLTEXT` indexes
  on `series(title, description)`, `videos(title, description, transcript)`,
  `speakers(name)`, `categories(name)`, queried in natural-language mode
  alongside the existing `LIKE '%q%'` substring pass, and — only when the
  exact pass returns nothing, as now — a PHP re-rank of at most 500 candidate
  titles by `similar_text`/`levenshtein`, which is how the app worked before
  the trigram migration. Test that "chruch" finds "Church".
- **`WITH RECURSIVE` for `categoryChainIds`**: load the category table
  (tens of rows) once per request and walk `parent_id` in PHP, which
  `getPluginStates()` already does; keep the depth cap.
- **`UPDATE … RETURNING`** for the API-key rate limit: a transaction with
  `SELECT … FOR UPDATE`, the window roll-over in PHP, `UPDATE`, commit. Still
  one atomic decision per request; test it with concurrent requests.
- **`gen_random_uuid()`** in two data migrations → ids generated in PHP.
- **`SELECT … FOR UPDATE`** works unchanged on InnoDB; keep it.
- Prisma's `P2002/P2025/P2003` mapping → PDO SQLSTATE `23000` (duplicate,
  foreign key) and affected-row checks, answering the same 409/404/400.

**Migrations** are numbered files under `app/Migrations/` (`0001_init.sql`,
`0002_….php` where data needs code), applied by `Migrator` inside the
installer, `/admin/update`, and `bin/migrate.php`; `schema_migrations` holds
the file name and a checksum. Each file must complete within one request on a
slow host or split itself; MySQL's DDL is not transactional, so a file that
fails halfway must be re-runnable (`IF NOT EXISTS`, checks before `ALTER`).
Both MySQL 8 and MariaDB 10.6 run every migration in CI.

**Data import from a running Next.js deployment** is a deliverable, not an
afterthought: add `scripts/export-for-php.mjs` to *this* repository (Prisma,
every table to newline-delimited JSON in a zip, ids and timestamps verbatim,
no secrets that don't transfer — push subscriptions and television tokens are
dropped; share-link password hashes are kept in their `scrypt$salt$key`
form, which the port verifies with a small vendored pure-PHP scrypt (RFC
7914, Node's defaults N=16384, r=8, p=1 — PHP has no native standard scrypt)
and rehashes with `password_hash` on the first successful unlock, while new
share passwords use `password_hash` from the start) and `/admin/tools/import`
in the port that reads it in resumable batches, maps table and column names,
converts arrays, and reports counts per table against the export's manifest. Files in Bunny Storage need no move if
the Files slot is Bunny; the importer offers to pull them to local disk in
batches otherwise. Auth0 users keep their identities; the importer creates no
local passwords, so those members either keep signing in through Auth0/OIDC
or use "forgot password" once local is enabled.

## Running on shared hosting

**Scheduled jobs.** The eight crons in `vercel.json` plus the prunes become
named jobs in a `jobs` table (`name`, `interval`, `next_run_at`,
`last_run_at`, `last_status`, `last_error`, `lock_until`), each a callable
with a time budget that stops starting new work at 20 seconds and marks what
it finished, exactly as `/api/cron/transcribe` does today. Two triggers, both
hitting `/cron/run?token=<cron token>`:

- a **real cron** the installer prints for cPanel/Plesk (`curl -fsS
  "https://…/cron/run?token=…" >/dev/null` every five minutes; `wget` and the
  `bin/cron.php` form too);
- **page-view triggering**, WordPress-style, when no real cron has been seen
  for 15 minutes: at the end of a page request, if any job is due, fire a
  non-blocking loopback request to the same URL (`fastcgi_finish_request`
  when available, a short-timeout socket otherwise) and let it run out of
  band. A `lock_until` claimed with a conditional `UPDATE` stops two
  triggers running one job at once.

`/admin/jobs` shows each job, when it last ran, whether a real cron is
detected, and a **Run now** button. Daily is no longer a platform limit, so
the default intervals are what the feature wants (status sync every 15
minutes, digests once a day at the configured hour, transcription every 10
minutes with its budget) — and the transcription docs stay honest that a 30-
second budget per run means a long sermon takes several runs, with the
`RUNNING` stale sweep unchanged.

**Long work stays browser-driven** where it is today (broadcast sending,
book text indexing, cover generation, feed sync from the admin button) and
the cron path is the backstop.

**File streaming.** `/api/files/[id]/content` remains the only URL for an
uploaded file and re-runs `canViewFile` per request. Local disk: serve with
Range support in 512 KB chunks with output buffering off, `X-Sendfile` /
`X-Accel-Redirect` / `X-LiteSpeed-Location` when the installer detects
support, `Content-Disposition` per `?download=1`, and the books'
`private, no-cache` plus `ETag`/`304` behaviour. Bunny Storage: when the
pull zone has token authentication, **redirect** to a URL signed for ten
minutes (and to the client IP when the option is on) rather than proxy — on
shared hosting, bandwidth through PHP is the thing to avoid; without token
auth, proxy with Range forwarding and show a warning on Admin → Services that
files are being served through PHP and why. The public podcast zone logic
(`podcast-mirror.ts`) ports as-is under the Bunny backend, and for local disk
the podcast enclosure is the app route, as it is when the zone is unset now.

**Uploads through PHP** (files under the Files slot, thumbnails, branding
logo, plugin zips): chunked from the browser in slices no larger than half
the measured `upload_max_filesize`, assembled under `storage/tmp/<upload
id>/` with a manifest, finalised in one request, and swept after a day. For
Bunny Storage, a finalised file is pushed with a streaming `PUT` (curl
`CURLOPT_INFILE`) so it never sits in memory; if the push can't finish inside
the request budget it is queued and completed by a job, and the admin sees
"uploading to storage" until it is. The existing "import from Bunny Storage"
flow remains the route for files uploaded via Bunny's own tools.

**Web Push** uses `minishlink/web-push`; the requirements page reports whether
`bcmath`/`gmp` are present and the Push settings group refuses to enable
without them. The daily digest, `PendingNotification`, and the inbox rows are
unchanged.

**Base path and HTTPS**: one function builds every absolute URL from the
configured base URL; the `.htaccess` `RewriteBase` is written by the
installer; `X-Forwarded-Proto` is trusted only when configured. Cookies are
scoped to the base path.

**Query Monitor** ports as a debug bar over the PDO wrapper: query count and
time, per-query list, render time, peak memory; gated by the config flag and
the database switch, shown only to `ADMIN`.

## Frontend

Port every page's behaviour, including the parts the README calls out as
deliberate: `generateMetadata` gating (a page for content the viewer can't
see gets a generic title and no image), JSON-LD `VideoObject` and
`BreadcrumbList`, slug aliases with permanent redirects, sequential unlock,
premieres, `?t=` timestamp links, the view-event beacon with its 30-minute
cookie throttle, the watch-progress heartbeat, the bottom bar with its
per-device tab choice and `localStorage` snapshot, the theme init script
before first paint, the standalone (installed PWA) chrome, the locale cookie
plus `Accept-Language` parsing with quality weights, and the Spanish
catalogue. `Lang/en.php` and `Lang/es.php` return arrays; a test asserts the
key sets are identical and every `{placeholder}` survives translation, which
is what the type system did for free.

The reader (`pdf.js`, `epub.js`), presenter, hymnal grid, contents editor,
book text reader (`tesseract.js` pointed at the vendored `/tesseract` path),
offline books/hymnals/services/calendar, and the offline shell keep their
storage formats; `offline.html` needs only its endpoint base path made
configurable.

## Feature inventory

Everything in the current app, in port order, with where the truth is. "Core"
is in `app/Modules/`; everything else is a bundled plugin.

| Area | Public routes | Admin routes | Source of truth |
| --- | --- | --- | --- |
| Library (core) | `/`, `/categories/[slug]`, `/series/[slug]`, `/videos/[slug]`, `/tags/[tag]`, `/speakers`, `/speakers/[slug]`, `/scripture`, `/scripture/[book]`, `/search`, `/recently-added`, `/feed.xml`, `/series/[slug]/podcast.xml`, `/sitemap.xml` | `/admin`, `/admin/categories`, `/admin/series`, `/admin/videos`, `/admin/files`, `/admin/speakers`, `/admin/trash`, `/admin/media-check`, `/admin/home-rows` | `content.ts`, `bunny.ts`, `video-source.ts`, `download-source.ts`, `podcast-mirror.ts`, `slug.ts`, `reorder.ts`, `drafts.ts`, `cover.ts`, `seo.ts`, `json-ld.ts`, `content-language.ts` |
| Access (core) | `/auth/*`, `/access-denied`, `/link` | `/admin/users`, `/admin/authorized-emails`, `/admin/access-attempts`, `/admin/permissions`, `/admin/audit`, `/admin/api-keys` | `current-user.ts`, `authorization.ts`, `identity-linking.ts`, `permissions.ts`, `capabilities.ts`, `audit.ts`, `api-keys*.ts`, `api-v1.ts`, `no-secrets.ts` |
| Site (core) | `/api/manifest`, `/api/locale`, `/profile`, `/profile/settings`, `/profile/inbox` | `/admin/branding`, `/admin/plugins`, `/admin/analytics`, `/admin/query-monitor`, `/admin/video-feeds` | `branding.ts`, `i18n/`, `nav.ts`, `nav-tabs.ts`, `device-settings.ts`, `standalone.ts`, `inbox.ts`, `profile.ts`, `data-export.ts`, `video-feeds.ts`, `video-feed-sync.ts`, `query-monitor.ts` |
| Member plugins | `/favorites`, `/watch-later`, `/playlists`, `/playlists/[id]`, `/subscriptions`, `/recently-played`, `/s/[token]`, `/share/*`, `/profile/shared-links`, `/profile/downloads` | `/admin/comments`, `/admin/announcements`, `/admin/webhooks`, `/admin/share-links`, `/admin/downloads` | `plugins.ts`, `share-links.ts`, `share-access.ts`, `share-password.ts`, `downloads.ts`, `download-platform.ts`, `push.ts`, `webhooks.ts`, `outline.ts` |
| Live (plugin) | `/live`, `/api/live/*` | `/admin/live` | `live-chat.ts` |
| Books, hymnals, services (plugins) | `/books/[fileId]`, `/read/[fileId]`, `/hymns/[fileId]`, `/present/[fileId]`, `/services`, `/services/[id]`, `/profile/rota`, `/api/offline/*`, `/api/hymnals/search`, `/api/hymns/lookup` | `/admin/services`, `/admin/services/report`, `/admin/teams` | `hymnal.ts`, `book-contents.ts`, `page-offset.ts`, `reader*.ts`, `toc-nav.ts`, `verses.ts`, `services.ts`, `rota.ts`, `offline-*.ts`, `fingerprint.ts`, `ocr-client.ts` |
| Schedules (plugin) | `/calendar`, `/api/schedules/*`, `/api/calendar-events`, `/api/sync/snapshot`, `/api/calendar/[token]/marine-team.ics`, `/api/profile/calendar` | `/admin/schedules`, `/admin/schedules/[id]`, `/admin/people` | `schedules/`, `sheets/`, `calendar-feed*.ts`, `ics.ts`, `names.ts` |
| Events, forms, prayer, groups, broadcasts (plugins) | `/events`, `/events/[slug]`, `/events/calendar.ics`, `/events/[slug]/event.ics`, `/forms`, `/forms/[slug]`, `/prayer`, `/groups`, `/groups/[slug]`, `/profile/events`, `/profile/groups` | `/admin/events`, `/admin/forms`, `/admin/prayer`, `/admin/groups`, `/admin/broadcasts` | `events.ts`, `event-series*.ts`, `recurrence.ts`, `forms*.ts`, `prayer*.ts`, `groups*.ts`, `broadcast*.ts`, `sms*.ts` |
| Television (plugin) | `/tv`, `/link`, `/profile/devices`, `/api/tv/*` | — | `tv-pairing.ts`, `tv-session.ts`, `tv-feed*.ts`, `tv-nav.ts` |
| Read API (core) | `/api/v1/*` | `/admin/api-keys` | `api-v1.ts`, `api-keys-query.ts` |

Keep every invariant the README argues for. A non-exhaustive list of the ones
that are easy to lose in a rewrite: `bylineFor` as the only place a prayer
author's name leaves; `presentGroup` as the only place an address travels;
`memberOnly` filtered on the video *and* its series in the television feed;
`assertNoSecrets` on the data export and the read API; the podcast
`publicPath` written after copy and cleared before delete; `claimToken` as a
conditional update; the three-way compare in feed sync; revoke never gated
by the share-links plugin; the heartbeat never un-completing a video;
`Serializable` avoided in favour of row locks; promotion stopping at the
first party too big to fit; consent rules in `planDelivery`.

## Testing and CI

- **PHPUnit** unit tests for every pure module the vitest suite covers —
  port the test files first, then the code until they pass. Same names, same
  cases.
- **Integration tests** against real MySQL 8 and MariaDB 10.6 in GitHub
  Actions service containers: migrations from empty, every `/api/*` route's
  status codes and shapes, the row-lock scenarios under concurrency (two
  registrations for the last place, two television polls, two cover takers),
  the API-key limiter, the allowlist revocation on an existing session.
- **A shared-hosting smoke test** in CI: a Docker image of Apache + PHP 8.2
  with `disable_functions=exec,shell_exec,proc_open,popen,system,passthru`,
  `open_basedir`, `upload_max_filesize=2M`, `max_execution_time=30`, no
  Composer, installed from the built release zip by HTTP only. It drives the
  installer with a headless browser, activates every bundled plugin, creates
  a category/series/video/file, installs a test plugin that throws on load
  and asserts the site stays up and the plugin is marked deactivated with
  the reason, installs one that exhausts memory on load and asserts the same,
  switches email from `mail()` to a Mailpit SMTP with a failing then a
  passing test and asserts only the second commits, and runs `/cron/run`.
- **Static checks**: PHPStan level 6 or higher, PSR-12 via PHP-CS-Fixer,
  `php -l` across the tree on 8.2/8.3/8.4, a grep that fails on the banned
  process functions, and a check that no template echoes an unescaped
  variable outside the explicit raw helper.
- The release zip is built in CI (`vendor/` included, dev tools excluded,
  `storage/` empty with the right permissions, a `MANIFEST` with checksums)
  and is what the smoke test installs.

## Work plan

The current code is large enough that "port it" is a programme, not a task.
Work in this order, and keep `docs/PORT_MAP.md` current from the first commit:
every page, route, model and lib module from the inventory above with its
port status (`todo`, `partial`, `done`, `dropped: reason`), so any later
session can pick up where this one stopped without re-deriving the state.

1. **Read** the files under *Read first*. Write `PORT_MAP.md` with every item
   at `todo`. Commit it before writing PHP.
2. **Foundation**: core (router, DB, view, session, CSRF, hooks, cache, log,
   errors), the full schema as `0001_init.sql`, the migrator, the installer,
   local sign-in, users and capabilities, the admin shell, branding, i18n,
   the services registry with the Files slot on local disk and Email on
   `mail()`, jobs with both triggers, the plugin and theme loaders with the
   auto-deactivation paths and their tests, the default theme skeleton.
3. **Library**: categories, series, videos (Bunny Stream provider with the
   browser upload), files, search, trash, audit, permissions and scoped
   grants, viewer restrictions, share links, downloads, feeds, sitemap,
   metadata. Then Auth0 and OIDC providers, Resend and SMTP providers, the
   Bunny Storage files provider.
4. **Bundled plugins**, simplest first (favorites, watch-later, view-counts,
   social-share, ratings, likes, related, up-next, watch-history, profiles,
   chapters, transcripts, recommendations, announcements, webhooks,
   notifications, subscriptions, playlists, sermon-notes, share-links,
   downloads), each proving the hook API by needing nothing else.
5. **The rest**: book reader and hymnals, service plans and rota, schedules
   and sheets, events and series, forms, prayer, groups, broadcasts and SMS,
   live streaming and chat, television, the read API, the data export and
   import.
6. **Hardening and docs**: the smoke test green, a security pass over every
   route's auth and CSRF, `INSTALL.md` written for a volunteer with
   screenshots' worth of detail and a "Locked out" section, `PLUGINS.md`,
   `THEMES.md`, `UPGRADING.md`, and the migration guide from a Vercel
   deployment.

Commit small and often on the branch you are given, with messages that say
what changed and why. When a decision here turns out to be wrong against the
code you meet, say so in `PORT_MAP.md` under "Deviations" with the reason,
and carry on — don't stall on it.

## Definition of done

- A fresh zip installs on the smoke-test image by HTTP alone and every
  bundled plugin activates.
- Sign-in, Video, Email and Files are each switchable from Admin → Services,
  every switch is preceded by its provider's test, a failing test refuses the
  switch, and an admin cannot switch sign-in into a state they can't sign in
  from.
- A plugin that throws, parse-fails, or exhausts memory on load is
  deactivated automatically with the reason visible; the site stays up; a
  plugin throwing in a hook is contained; `/admin/plugins` is reachable with
  every third-party plugin broken.
- A theme installs from a zip, overrides one template, and a broken theme
  falls back to the default.
- Every URL in the inventory answers; `offline.html`, the service worker, the
  television feed, the podcast feed, the `.ics` feeds and `/api/v1` are
  byte-compatible with the current app's output for the same data.
- The export from the Next.js deployment imports and the counts match.
- CI is green on MySQL 8 and MariaDB 10.6, PHPStan passes, the banned-function
  grep is clean.
- `PORT_MAP.md` has no `todo` rows, and every `dropped` row has a reason a
  maintainer would accept.

## Non-goals

Do not build a Node runtime dependency, a JavaScript bundler step, a Docker
requirement for production, a queue server, WebSockets, a second ORM, or a
Vercel-shaped deployment. Do not proxy video through PHP. Do not keep pooled
and direct database URLs, `force-dynamic`, React `cache()`, Prisma, or any
other artefact of the platform this is leaving; keep the reasons they existed
where those reasons still apply.
