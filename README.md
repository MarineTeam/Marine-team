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
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), run it.
   (Creates tables, Row-Level-Security policies, and seeds the sample content.)
3. **Project Settings → API**: copy the **Project URL** and **anon public** key.
4. Paste them into [`js/config.js`](js/config.js) under `supabase`.

RLS is set so the public can **read** content and **submit** gifts/RSVPs/prayer requests, but
**cannot read** others' submissions — staff read those via the service role or an admin policy.

### 2. Auth0 — login (optional)
1. Create an **Application → Single Page Application** at [auth0.com](https://auth0.com).
2. In its settings add your deploy URL (e.g. `https://your-site.vercel.app`) to
   **Allowed Callback URLs**, **Logout URLs**, and **Web Origins**.
3. Copy **Domain** and **Client ID** into `js/config.js` under `auth0`.
   A **Log in / Log out** button then appears in the nav automatically.

### 3. bunny.net — media (optional)
1. Create a **Pull Zone** (and optionally a **Stream** library) at [bunny.net](https://bunny.net).
2. Put your Pull Zone hostname in `js/config.js` under `bunny.pullZone`.
3. Store a sermon's video URL in the `sermons.video_url` column; swap the simulated player in
   `openPlayer()` for a real `<video>`/HLS source pointing at the bunny CDN.

### 4. Deploy to Vercel
```
npm i -g vercel      # once
vercel               # from the repo root → follow prompts
vercel --prod        # promote to production
```
Vercel serves the static files as-is ([`vercel.json`](vercel.json) adds sensible headers).
Prefer **bunny.net**? Point a Pull Zone at this repo/origin — it's just static files.

> **Keys in the browser:** the Supabase **anon** key and Auth0 **client ID** are *designed* to be
> public — safety comes from RLS + Auth0 config, not secrecy. **Never** put a Supabase
> service-role key or any secret in `js/config.js`.

---

## Project structure
```
index.html            # app shell (nav, footer, modal + toast hosts)
css/styles.css        # design system + all components
js/
  config.js           # service keys + mock/live auto-detect
  data.js             # seed content (mock mode + DB seed reference)
  api.js              # data layer — Supabase live, or localStorage mock
  auth.js             # Auth0 wrapper (optional)
  app.js              # router, views, player, giving & form flows
supabase/schema.sql   # tables + RLS + seed
vercel.json           # static-hosting config
```

---

_Educational demo. Not affiliated with Subsplash, Inc. All content is sample data._
