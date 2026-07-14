-- ============================================================
-- Add members-only video support to existing installs.
-- Run in the Supabase SQL Editor (safe to re-run).
-- Stores the bunny.net Stream video GUID per sermon; playback is
-- gated by Auth0 + a signed embed (see /api/embed.js).
-- ============================================================
alter table public.sermons add column if not exists video_id text;

-- Example: attach a real bunny video to a sermon (staff normally do this
-- from the admin editor's "Bunny video ID" field):
-- update public.sermons set video_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' where id = 's1';
