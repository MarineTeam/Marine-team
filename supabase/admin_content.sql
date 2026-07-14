-- ============================================================
-- Make the site fully staff-editable (CMS)
-- Run AFTER schema.sql and admin_policies.sql, in the SQL Editor.
--
-- Adds:
--   1. A `settings` table (one row) for church name/tagline/contact/
--      service times — so the public site is editable without code.
--   2. Write policies letting authenticated staff INSERT/UPDATE/DELETE
--      sermons, events, ministries, and settings.
-- Anonymous visitors keep read-only access (and can still submit forms).
-- ============================================================

-- ---------- settings (singleton row id=1) ----------
create table if not exists public.settings (
  id         int primary key default 1,
  name       text,
  short_name text,
  tagline    text,
  address    text,
  phone      text,
  email      text,
  times      jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id,name,short_name,tagline,address,phone,email,times) values
 (1,'Grace Community Church','Grace','A place to belong, believe, and become.',
  '1200 Cedar Ridge Rd, Springfield','(555) 018-2200','hello@gracecommunity.example',
  '[{"day":"Sunday","service":"Morning Worship","time":"9:00 & 11:00 AM"},
    {"day":"Wednesday","service":"Midweek + Kids","time":"6:30 PM"}]'::jsonb)
on conflict (id) do nothing;

alter table public.settings enable row level security;

drop policy if exists "read settings" on public.settings;
create policy "read settings" on public.settings
  for select using (true);

drop policy if exists "staff write settings" on public.settings;
create policy "staff write settings" on public.settings
  for all to authenticated using (true) with check (true);

-- ---------- staff can manage content ----------
drop policy if exists "staff write sermons" on public.sermons;
create policy "staff write sermons" on public.sermons
  for all to authenticated using (true) with check (true);

drop policy if exists "staff write events" on public.events;
create policy "staff write events" on public.events
  for all to authenticated using (true) with check (true);

drop policy if exists "staff write ministries" on public.ministries;
create policy "staff write ministries" on public.ministries
  for all to authenticated using (true) with check (true);
