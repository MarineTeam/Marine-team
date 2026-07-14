# Grace Community Church — a Subsplash-style church site

A complete **end-user church website** — the kind of site a Subsplash customer publishes to
its congregation: watch messages, give, browse events, find groups, plan a visit, and request
prayer. Built as a **static frontend + serverless backend** on **100% free-tier** services.

| Concern | Service (free tier) | Notes |
|---|---|---|
| Frontend hosting | **Vercel** (or **bunny.net** static) | Zero-config static deploy |
| Database + REST API | **Supabase** (Postgres + PostgREST) | Content + form submissions |
| Auth (member/staff login) | **Auth0** (SPA) | Optional — config-gated |
| Media / video CDN | **bunny.net** | Sermon video + images |

There is **no build step and no server to run** — it's plain HTML/CSS/vanilla JS (ES modules),
so it deploys to any static host and the browser talks directly to Supabase via the JS client.

---

## Pages & features

- **Home** — hero, live service times, latest message, upcoming events, next-steps, prayer CTA
- **Watch** — searchable/filterable sermon library + a working (simulated) video player
- **Give** — one-time/weekly/monthly, funds, custom amounts, live total, **persisted** receipt
- **Events** — event cards with **RSVP** (saved to the database)
- **Groups** — ministries & small groups with "I'm interested" capture
- **Plan a Visit** — FAQ + a "let us know you're coming" form
- **Prayer & Contact** — prayer request form (public/private) + contact info
- **Staff admin** (`#/admin`) — Supabase-Auth login; view giving/RSVPs/prayer, **and a full CMS**:
  add/edit/delete sermons, events, and ministries, plus edit site settings (name, tagline,
  contact, service times). Every change updates the public site live.
- Responsive, mobile nav, scroll animations, optional Auth0 login button

## Runs offline out of the box (mock mode)

Until you add service keys, the site runs in **mock mode**: content comes from `js/data.js`
and form submissions are saved to `localStorage`. Every page and flow works with no accounts,
no network, no build. Add keys → it automatically switches to the live services.

```
# just open it, or serve the folder:
npx serve .                 # if you have Node
# → then visit http://localhost:3000
```

---

## Go live (all free tiers)

### 1. Supabase — database + API
1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, and run these three in order:
   - [`supabase/schema.sql`](supabase/schema.sql) — tables, RLS, seed content.
   - [`supabase/admin_policies.sql`](supabase/admin_policies.sql) — let staff **read** submissions.
   - [`supabase/admin_content.sql`](supabase/admin_content.sql) — `settings` table + let staff **edit** content.
3. **Project Settings → API**: copy the **Project URL** and **anon public** key.
4. Paste them into [`js/config.js`](js/config.js) under `supabase`.
5. **Authentication → Users → Add user**: create a staff account (tick *Auto Confirm*) to log
   into `#/admin`.

RLS is set so the public can **read** content and **submit** gifts/RSVPs/prayer requests but
**cannot read** others' submissions; only **authenticated staff** can read submissions and
add/edit/delete content + settings.

### 2. Auth0 — member login (gates sermon video)
1. Create an **Application → Single Page Application** at [auth0.com](https://auth0.com).
2. Add your deploy URL (e.g. `https://your-site.vercel.app`) to **Allowed Callback URLs**,
   **Logout URLs**, and **Web Origins**.
3. Copy **Domain** and **Client ID** into `js/config.js` under `auth0`.
   A **Log in / Log out** button appears in the nav, and members must sign in to watch
   members-only videos. *(This is separate from staff admin, which uses Supabase Auth.)*

### 3. bunny.net + members-only video
Videos are gated exactly like the Marine video portals: a short-lived, signed bunny.net
embed token is generated **server-side** per view, behind an Auth0 login — the token key
never reaches the browser.
1. bunny.net → **Stream** → create a **Video Library**; upload sermons.
2. Library → **Security** → enable **Token Authentication**; copy the **Authentication Key**.
3. Run [`supabase/add_video.sql`](supabase/add_video.sql) (adds `sermons.video_id`).
4. In the admin editor, paste each sermon's **bunny video GUID** into the *Bunny video ID* field.
5. Set the serverless env vars in Vercel (see [`.env.example`](.env.example)):
   `AUTH0_DOMAIN`, `BUNNY_LIBRARY_ID`, `BUNNY_TOKEN_AUTH_KEY`.

Flow: member clicks a 🔒 sermon → Auth0 login → browser calls
[`/api/embed`](api/embed.js) with the Auth0 access token → the function verifies it and
returns a signed `iframe.mediadelivery.net/embed/...` URL. Sermons without a `video_id`
fall back to the built-in demo player.

### 4. Deploy to Vercel
```
npm i -g vercel      # once
vercel               # from the repo root → follow prompts
vercel --prod        # promote to production
```
Vercel serves the static files and runs [`api/embed.js`](api/embed.js) as a serverless
function automatically ([`vercel.json`](vercel.json) adds sensible headers).

> **Keys in the browser:** the Supabase **anon** key and Auth0 **client ID** are *designed* to be
> public — safety comes from RLS + Auth0 config, not secrecy. **Never** put a Supabase
> service-role key or any secret in `js/config.js`.

---

## Project structure
```
index.html               # app shell (nav, footer, modal + toast hosts)
css/styles.css           # design system + all components
js/
  config.js              # service keys + mock/live auto-detect
  data.js                # seed content (mock mode + DB seed reference)
  api.js                 # data layer — Supabase live, or localStorage mock
  auth.js                # Auth0 member-login wrapper
  app.js                 # router, views, players, giving, admin/CMS
api/embed.js             # Vercel function: Auth0-gated signed bunny embed
supabase/
  schema.sql             # tables + RLS + seed
  admin_policies.sql     # staff read access to submissions
  admin_content.sql      # settings table + staff write (CMS)
  add_video.sql          # sermons.video_id column
.env.example             # server env vars for the embed function
vercel.json              # hosting + headers
```

---

_Educational demo. Not affiliated with Subsplash, Inc. All content is sample data._
