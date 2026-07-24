# Media Library

A Subsplash-style media library: Auth0 login, an admin CMS for managing
series/categories/videos/files, video hosted on Bunny Stream, and downloadable
files hosted on Bunny Storage.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS
- Prisma + PostgreSQL
- `@auth0/nextjs-auth0` for login/session (Regular Web Application flow)
- Bunny Stream (video) + Bunny Storage (files), uploaded directly from the
  browser via TUS so large files never pass through the app server

## Setup

1. Copy `.env.example` to `.env` and fill in real values:
   - A Postgres connection string (`DATABASE_URL`)
   - An Auth0 "Regular Web Application" (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
     `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` — generate with `openssl rand -hex 32`)
     - In the Auth0 app settings, set Allowed Callback URLs to
       `http://localhost:3000/auth/callback` and Allowed Logout URLs to
       `http://localhost:3000`
   - `ADMIN_EMAILS`: comma-separated emails granted the `ADMIN` role on login
   - A Bunny Stream video library (`BUNNY_STREAM_*`) and a Bunny Storage zone
     with a public pull zone (`BUNNY_STORAGE_*`)
2. Install dependencies and generate the Prisma client:
   ```bash
   npm install
   ```
3. Push the schema to your database:
   ```bash
   npm run db:migrate
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## How it works

- **Public site** (`/`, `/series/[slug]`, `/videos/[slug]`): browse published
  categories/series, watch videos (embedded Bunny Stream player), download
  files. Content flagged `memberOnly` requires login.
- **Auth**: `/auth/login`, `/auth/logout`, `/auth/callback` are handled
  automatically by the Auth0 SDK's `proxy.ts` (Next.js 16 renamed Middleware
  to Proxy). Logging in with Auth0 only proves identity — it does **not**
  grant access by itself. `getCurrentUser()` only returns (and syncs) a
  `User` row for emails that are either already in the `User` table (added
  ahead of time via `/admin/users`) or listed in `ADMIN_EMAILS` (which
  self-bootstraps as `ADMIN` on first login, so you always have a way in).
  Anyone else who logs in through Auth0 is treated as logged out everywhere
  in the app — the Navbar shows "Access not authorized" instead of their
  name. Manage who's allowed in at `/admin/users`.
- **Admin CMS** (`/admin`, gated to `ADMIN` role): manage categories, series,
  videos, and files. Video upload creates a placeholder in Bunny Stream,
  signs a TUS upload session, and streams the file straight from the
  browser to Bunny; small files (≤4.5MB) are uploaded to Bunny Storage via
  the server.

## Useful scripts

- `npm run db:studio` — browse the database with Prisma Studio
- `npm run build` — production build
