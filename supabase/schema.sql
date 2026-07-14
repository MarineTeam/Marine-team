-- ============================================================
-- Grace Community Church — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / idempotent policies.
-- ============================================================

-- ---------- CONTENT TABLES (public read) ----------
create table if not exists public.sermons (
  id         text primary key,
  title      text not null,
  speaker    text not null,
  series     text,
  duration   text,
  date       date not null,
  category   text,
  featured   boolean default false,
  hue        int  default 212,
  blurb      text,
  video_url  text,               -- bunny.net Stream/CDN URL (optional)
  video_id   text,               -- bunny.net Stream video GUID (members-only playback)
  created_at timestamptz default now()
);

create table if not exists public.events (
  id         text primary key,
  title      text not null,
  date       date not null,
  time       text,
  location   text,
  tag        text,
  hue        int default 212,
  blurb      text,
  created_at timestamptz default now()
);

create table if not exists public.ministries (
  id         text primary key,
  name       text not null,
  audience   text,
  hue        int default 212,
  blurb      text,
  "when"     text,
  created_at timestamptz default now()
);

-- ---------- SUBMISSION TABLES (public insert, private read) ----------
create table if not exists public.gifts (
  id         uuid primary key default gen_random_uuid(),
  reference  text not null default ('GCC-' || upper(substr(md5(random()::text), 1, 6))),
  amount     numeric not null check (amount > 0),
  frequency  text not null default 'One time',
  fund       text not null default 'General Fund',
  name       text,
  email      text,
  created_at timestamptz default now()
);

create table if not exists public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  name       text not null,
  email      text,
  guests     text,
  created_at timestamptz default now()
);

create table if not exists public.prayer_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  request    text not null,
  is_private boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.sermons          enable row level security;
alter table public.events           enable row level security;
alter table public.ministries       enable row level security;
alter table public.gifts            enable row level security;
alter table public.rsvps            enable row level security;
alter table public.prayer_requests  enable row level security;

-- Public (anon) can READ content
drop policy if exists "read sermons"    on public.sermons;
create policy "read sermons"    on public.sermons    for select using (true);
drop policy if exists "read events"     on public.events;
create policy "read events"     on public.events     for select using (true);
drop policy if exists "read ministries" on public.ministries;
create policy "read ministries" on public.ministries for select using (true);

-- Public (anon) can SUBMIT to forms — but NOT read others' submissions.
-- (Reading gifts / prayer / rsvps is left to authenticated staff via the
--  service role or a dedicated admin policy — never exposed to anon.)
drop policy if exists "submit gifts"    on public.gifts;
create policy "submit gifts"    on public.gifts    for insert with check (true);
drop policy if exists "submit rsvps"    on public.rsvps;
create policy "submit rsvps"    on public.rsvps    for insert with check (true);
drop policy if exists "submit prayer"   on public.prayer_requests;
create policy "submit prayer"   on public.prayer_requests for insert with check (true);

-- ============================================================
-- Seed content (matches js/data.js). Re-runnable via upsert.
-- ============================================================
insert into public.sermons (id,title,speaker,series,duration,date,category,featured,hue,blurb) values
 ('s1','The Anchor for Your Soul','Pastor David Reyes','Hope That Holds','38:12','2026-07-06','Faith',true,212,'When the storms of life hit, where do you turn? Discover the unshakable hope found in Hebrews 6.'),
 ('s2','Grace Upon Grace','Pastor Anna Cole','Rediscovering Grace','32:45','2026-06-29','Grace',false,268,'A fresh look at the endless grace of God and how it reshapes everyday life.'),
 ('s3','Built to Belong','Pastor David Reyes','Better Together','41:03','2026-06-22','Community',false,168,'We were never meant to walk alone. Exploring the beauty of biblical community.'),
 ('s4','The Generous Life','Elder Marcus Bell','Kingdom Economy','29:57','2026-06-15','Stewardship',false,28,'What if generosity was less about giving and more about becoming?'),
 ('s5','Prayer That Moves','Pastor Anna Cole','The Secret Place','35:20','2026-06-08','Prayer',false,320,'Learning to pray with confidence, persistence, and expectation.'),
 ('s6','Light in the Dark','Pastor David Reyes','Hope That Holds','27:41','2026-06-01','Faith',false,200,'No darkness is deep enough to overcome the light of Christ.'),
 ('s7','Roots and Wings','Pastor Grace Kim','Family Matters','44:18','2026-05-25','Family',false,140,'Raising the next generation with both deep roots and bold faith.'),
 ('s8','The Weight of Words','Elder Marcus Bell','Wisdom for Living','31:09','2026-05-18','Wisdom',false,48,'Our words carry weight. James shows us how to steward them well.'),
 ('s9','Unhurried','Pastor Anna Cole','Rest for the Weary','36:52','2026-05-11','Rest',false,190,'Escaping the tyranny of hurry to find the rhythm of grace.')
on conflict (id) do nothing;

insert into public.events (id,title,date,time,location,tag,hue,blurb) values
 ('e1','Sunday Gathering','2026-07-19','9:00 & 11:00 AM','Main Auditorium','Weekly',212,'Join us for worship, teaching, and community every Sunday morning.'),
 ('e2','Summer Baptism Celebration','2026-07-26','5:00 PM','Riverside Park','Special',190,'Celebrate new life in Christ with baptisms, food, and worship by the water.'),
 ('e3','Young Adults Night','2026-07-22','7:00 PM','The Loft','Young Adults',268,'Food, worship, and real conversation for 18–30s.'),
 ('e4','Serve the City Day','2026-08-02','8:30 AM','Citywide','Outreach',28,'One day, dozens of projects, one mission: love our neighbors well.'),
 ('e5','Marriage Workshop','2026-08-09','10:00 AM','Room 210','Marriage',320,'A half-day intensive to strengthen and refresh your marriage.'),
 ('e6','Kids Summer Camp','2026-08-11','All Week','Camp Redwood','Kids',140,'A week of adventure, faith, and unforgettable memories for grades 1–5.')
on conflict (id) do nothing;

insert into public.ministries (id,name,audience,hue,blurb,"when") values
 ('m1','Grace Kids','Birth – Grade 5',140,'Safe, fun, Bible-based environments where kids discover Jesus.','Sundays 9 & 11 AM'),
 ('m2','Students','Grades 6 – 12',268,'Middle & high schoolers growing in faith and friendship.','Wednesdays 6:30 PM'),
 ('m3','Young Adults','Ages 18 – 30',320,'Community, worship, and purpose for the next generation.','Tuesdays 7 PM'),
 ('m4','Small Groups','Everyone',168,'Life is better together. Find a group near you.','Various times'),
 ('m5','Worship & Arts','Musicians & creatives',200,'Use your gifts to help people encounter God.','Rehearsals Thursdays'),
 ('m6','Outreach','Servants at heart',28,'Loving our city through service and generosity.','Monthly projects')
on conflict (id) do nothing;
