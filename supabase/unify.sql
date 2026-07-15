-- ============================================================
-- Unify sermons + videos into ONE library.
-- Run in the Supabase SQL Editor (after the earlier scripts).
--
-- A bunny.net video is now just a sermon with a video_id. Each sermon can be
-- Published/Draft and Members-only/Guest. The separate `videos` table is no
-- longer used by the app (safe to keep or drop).
-- ============================================================
alter table public.sermons add column if not exists video_id     text;
alter table public.sermons add column if not exists published     boolean default true;
alter table public.sermons add column if not exists members_only  boolean default true;

-- Existing seeded sermons: keep them visible, and viewable without login
-- (they have no real video, so nothing to gate).
update public.sermons set published = true      where published is null;
update public.sermons set members_only = false  where members_only is null;

-- Public visitors: only PUBLISHED sermons are visible.
drop policy if exists "read sermons" on public.sermons;
create policy "read sermons" on public.sermons
  for select using (published = true);

-- Staff (authenticated) can read every sermon, incl. drafts.
drop policy if exists "staff read sermons" on public.sermons;
create policy "staff read sermons" on public.sermons
  for select to authenticated using (true);

-- (Write policy "staff write sermons" from admin_content.sql already covers
--  insert/update/delete for authenticated staff.)
