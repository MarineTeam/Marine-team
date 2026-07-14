/* ============================================================
   API layer — one interface, two backends.
   - LIVE:  Supabase (Postgres + auto REST). Loaded lazily from CDN.
   - MOCK:  local SEED data + localStorage (offline / pre-setup).
   Every method returns a Promise so the UI code is identical.
   ============================================================ */
(function () {
  const C = window.CONFIG;
  const SEED = window.SEED;
  const LIVE = C.flags.supabase;

  /* ---------- lazy Supabase client ---------- */
  let _sb = null;
  async function sb() {
    if (_sb) return _sb;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    _sb = createClient(C.supabase.url, C.supabase.anonKey);
    return _sb;
  }

  /* ---------- localStorage helpers (mock writes) ---------- */
  const LS = {
    get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('gcc_' + k)); return v ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem('gcc_' + k, JSON.stringify(v)),
    push: (k, v) => { const a = LS.get(k, []); a.unshift(v); LS.set(k, a); return v; }
  };
  // Editable mock collection: seed from SEED on first use, then persist edits.
  const rowKey = x => String(x.id ?? x.guid); // sermons/events use id; videos use guid
  function coll(key, seed) { const cur = LS.get(key, null); if (cur) return cur; LS.set(key, seed); return [...seed]; }
  function mockUpsert(key, seed, row) {
    const arr = coll(key, seed); const i = arr.findIndex(x => rowKey(x) === rowKey(row));
    if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.unshift(row);
    LS.set(key, arr); return row;
  }
  function mockDelete(key, seed, id) { LS.set(key, coll(key, seed).filter(x => rowKey(x) !== String(id))); }

  const ref = () => 'GCC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const wait = (v, ms = 260) => new Promise(r => setTimeout(() => r(v), ms)); // tiny latency so UI feels real

  /* ---------- reads ---------- */
  const byDate = (a, b, dir) => dir * (String(a.date).localeCompare(String(b.date)));
  async function getSermons() {
    if (!LIVE) return wait(coll('c_sermons', SEED.sermons).slice().sort((a, b) => byDate(a, b, -1)));
    const { data, error } = await (await sb()).from('sermons').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data;
  }
  async function getEvents() {
    if (!LIVE) return wait(coll('c_events', SEED.events).slice().sort((a, b) => byDate(a, b, 1)));
    const { data, error } = await (await sb()).from('events').select('*').order('date', { ascending: true });
    if (error) throw error;
    return data;
  }
  async function getMinistries() {
    if (!LIVE) return wait(coll('c_ministries', SEED.ministries).slice());
    const { data, error } = await (await sb()).from('ministries').select('*');
    if (error) throw error;
    return data;
  }
  async function getStats() {
    // Stats are derived; in live mode we sum gifts, else use seed.
    if (!LIVE) return wait({ ...SEED.stats });
    return { ...SEED.stats };
  }

  /* ---------- writes ---------- */
  // NOTE: the submission tables (gifts / rsvps / prayer_requests) grant anon
  // INSERT but not SELECT (privacy). So we insert with return=minimal — i.e.
  // NO `.select()` — and build the returned record client-side. The reference
  // is generated here and stored, so staff and the giver see the same code.
  async function createGift(g) {
    const record = { reference: ref(), created_at: new Date().toISOString(), ...g };
    if (!LIVE) { LS.push('gifts', record); return wait(record); }
    const { error } = await (await sb()).from('gifts').insert({ ...g, reference: record.reference });
    if (error) throw error;
    return record;
  }
  async function createRsvp(r) {
    const record = { created_at: new Date().toISOString(), ...r };
    if (!LIVE) { LS.push('rsvps', record); return wait(record); }
    const { error } = await (await sb()).from('rsvps').insert(r);
    if (error) throw error;
    return record;
  }
  async function createPrayer(p) {
    const record = { created_at: new Date().toISOString(), ...p };
    if (!LIVE) { LS.push('prayers', record); return wait(record); }
    const { error } = await (await sb()).from('prayer_requests').insert(p);
    if (error) throw error;
    return record;
  }

  /* ---------- admin: Supabase Auth + staff reads ---------- */
  async function adminUser() {
    if (!LIVE) return LS.get('adminUser', null);
    const { data } = await (await sb()).auth.getUser();
    return data.user || null;
  }
  async function adminSignIn(email, password) {
    if (!LIVE) { const u = { email }; localStorage.setItem('gcc_adminUser', JSON.stringify(u)); return wait(u); }
    const { data, error } = await (await sb()).auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async function adminSignOut() {
    if (!LIVE) { localStorage.removeItem('gcc_adminUser'); return; }
    await (await sb()).auth.signOut();
  }
  async function listTable(name, lsKey) {
    if (!LIVE) return wait(LS.get(lsKey, []));
    const { data, error } = await (await sb()).from(name).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  const listGifts = () => listTable('gifts', 'gifts');
  const listRsvps = () => listTable('rsvps', 'rsvps');
  const listPrayers = () => listTable('prayer_requests', 'prayers');

  /* ---------- admin: content CRUD (staff-authenticated) ---------- */
  async function upsertRow(table, key, seed, row) {
    if (!LIVE) return wait(mockUpsert(key, seed, row));
    const { error } = await (await sb()).from(table).upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return row;
  }
  async function deleteRow(table, key, seed, id) {
    if (!LIVE) { mockDelete(key, seed, id); return; }
    const { error } = await (await sb()).from(table).delete().eq('id', id);
    if (error) throw error;
  }
  const saveSermon = r => upsertRow('sermons', 'c_sermons', SEED.sermons, r);
  const deleteSermon = id => deleteRow('sermons', 'c_sermons', SEED.sermons, id);
  const saveEvent = r => upsertRow('events', 'c_events', SEED.events, r);
  const deleteEvent = id => deleteRow('events', 'c_events', SEED.events, id);
  const saveMinistry = r => upsertRow('ministries', 'c_ministries', SEED.ministries, r);
  const deleteMinistry = id => deleteRow('ministries', 'c_ministries', SEED.ministries, id);

  /* ---------- admin: editable site settings ---------- */
  const fromRow = d => ({ name: d.name, shortName: d.short_name, tagline: d.tagline, address: d.address, phone: d.phone, email: d.email, times: d.times || [] });
  async function getSettings() {
    if (!LIVE) return wait(LS.get('c_settings', null) || { ...window.CONFIG.church });
    const { data, error } = await (await sb()).from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : { ...window.CONFIG.church };
  }
  async function saveSettings(o) {
    if (!LIVE) { LS.set('c_settings', o); return wait(o); }
    const row = { id: 1, name: o.name, short_name: o.shortName, tagline: o.tagline, address: o.address, phone: o.phone, email: o.email, times: o.times, updated_at: new Date().toISOString() };
    const { error } = await (await sb()).from('settings').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return o;
  }

  /* ---------- bunny.net video sync + publishing ---------- */
  // Public site: only PUBLISHED videos (anon-readable).
  async function getPublishedVideos() {
    if (!LIVE) return wait(coll('c_videos', []).filter(v => v.published)
      .sort((a, b) => (a.sort_order - b.sort_order) || String(b.synced_at || '').localeCompare(String(a.synced_at || ''))));
    const { data, error } = await (await sb()).from('videos').select('*').eq('published', true).order('sort_order').order('synced_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  // Admin: every synced video (published or not).
  async function adminListVideos() {
    if (!LIVE) return wait(coll('c_videos', []));
    const { data, error } = await (await sb()).from('videos').select('*').order('synced_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  // Pull the raw library from bunny.net (mock: SEED; live: /api/videos with staff token).
  async function fetchBunnyLibrary() {
    if (!LIVE) return wait(SEED.bunnyLibrary.map(v => ({ ...v })));
    const { data: { session } } = await (await sb()).auth.getSession();
    const token = session?.access_token;
    const r = await fetch('/api/videos', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Error ${r.status}`); }
    return (await r.json()).items || [];
  }
  // Sync: merge the bunny library into our table, KEEPING existing publish flags.
  async function syncVideos() {
    const [lib, existing] = await Promise.all([fetchBunnyLibrary(), adminListVideos()]);
    const byGuid = Object.fromEntries(existing.map(v => [v.guid, v]));
    let added = 0;
    for (const v of lib) {
      const prev = byGuid[v.guid];
      const row = {
        guid: v.guid, title: v.title, length: v.length || 0, thumbnail: v.thumbnail || '',
        published: prev ? prev.published : false, featured: prev ? prev.featured : false,
        sort_order: prev ? prev.sort_order : 0, synced_at: new Date().toISOString()
      };
      if (!prev) added++;
      if (!LIVE) mockUpsert('c_videos', [], row);
      else { const { error } = await (await sb()).from('videos').upsert(row, { onConflict: 'guid' }); if (error) throw error; }
    }
    return { total: lib.length, added };
  }
  async function setVideoPublished(guid, published) {
    if (!LIVE) { const arr = coll('c_videos', []); const v = arr.find(x => x.guid === guid); if (v) { v.published = published; LS.set('c_videos', arr); } return wait(v); }
    const { error } = await (await sb()).from('videos').update({ published }).eq('guid', guid);
    if (error) throw error;
  }

  window.API = {
    live: LIVE,
    getSermons, getEvents, getMinistries, getStats, getPublishedVideos,
    createGift, createRsvp, createPrayer,
    adminUser, adminSignIn, adminSignOut, listGifts, listRsvps, listPrayers,
    saveSermon, deleteSermon, saveEvent, deleteEvent, saveMinistry, deleteMinistry,
    getSettings, saveSettings,
    adminListVideos, syncVideos, setVideoPublished
  };
})();
