-- ============================================================
-- bunny.net video sync + publish control
-- Run in the Supabase SQL Editor (after schema.sql + admin_content.sql).
--
-- Staff "Sync from bunny.net" pulls the library into this table; each row can
-- be published or not. The public site reads ONLY published rows; staff read
-- and manage all of them. Playback is still gated (Auth0 + signed embed).
-- ============================================================
create table if not exists public.videos (
  guid       text primary key,          -- bunny Stream video GUID
  title      text,
  length     int default 0,             -- seconds
  thumbnail  text,
  published  boolean default false,
  featured   boolean default false,
  sort_order int default 0,
  synced_at  timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.videos enable row level security;

-- Public visitors: only published rows are visible.
drop policy if exists "read published videos" on public.videos;
create policy "read published videos" on public.videos
  for select using (published = true);

-- Staff: read every row and manage them.
drop policy if exists "staff read videos" on public.videos;
create policy "staff read videos" on public.videos
  for select to authenticated using (true);
drop policy if exists "staff write videos" on public.videos;
create policy "staff write videos" on public.videos
  for all to authenticated using (true) with check (true);
