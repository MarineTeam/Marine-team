-- ============================================================
-- Staff admin read access
-- Run AFTER schema.sql, in the Supabase SQL Editor.
--
-- Lets any *authenticated* (logged-in) Supabase user read the
-- submission tables. Anonymous visitors still cannot (schema.sql
-- grants them INSERT only). Create staff accounts under
--   Dashboard → Authentication → Users → Add user
-- and share them only with your team.
--
-- Want to lock it down to specific people? Replace `using (true)`
-- with e.g.  using ( (auth.jwt() ->> 'email') in ('pastor@church.org','admin@church.org') )
-- ============================================================

drop policy if exists "staff read gifts"  on public.gifts;
create policy "staff read gifts"  on public.gifts
  for select to authenticated using (true);

drop policy if exists "staff read rsvps"  on public.rsvps;
create policy "staff read rsvps"  on public.rsvps
  for select to authenticated using (true);

drop policy if exists "staff read prayer" on public.prayer_requests;
create policy "staff read prayer" on public.prayer_requests
  for select to authenticated using (true);
