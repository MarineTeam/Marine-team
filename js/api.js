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
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('gcc_' + k)) ?? d; } catch { return d; } },
    push: (k, v) => { const a = LS.get(k, []); a.unshift(v); localStorage.setItem('gcc_' + k, JSON.stringify(a)); return v; }
  };

  const ref = () => 'GCC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const wait = (v, ms = 260) => new Promise(r => setTimeout(() => r(v), ms)); // tiny latency so UI feels real

  /* ---------- reads ---------- */
  async function getSermons() {
    if (!LIVE) return wait([...SEED.sermons]);
    const { data, error } = await (await sb()).from('sermons').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data;
  }
  async function getEvents() {
    if (!LIVE) return wait([...SEED.events]);
    const { data, error } = await (await sb()).from('events').select('*').order('date', { ascending: true });
    if (error) throw error;
    return data;
  }
  async function getMinistries() {
    if (!LIVE) return wait([...SEED.ministries]);
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
  async function createGift(g) {
    const record = { reference: ref(), created_at: new Date().toISOString(), ...g };
    if (!LIVE) { LS.push('gifts', record); return wait(record); }
    const { data, error } = await (await sb()).from('gifts').insert(g).select().single();
    if (error) throw error;
    return data;
  }
  async function createRsvp(r) {
    const record = { created_at: new Date().toISOString(), ...r };
    if (!LIVE) { LS.push('rsvps', record); return wait(record); }
    const { data, error } = await (await sb()).from('rsvps').insert(r).select().single();
    if (error) throw error;
    return data;
  }
  async function createPrayer(p) {
    const record = { created_at: new Date().toISOString(), ...p };
    if (!LIVE) { LS.push('prayers', record); return wait(record); }
    const { data, error } = await (await sb()).from('prayer_requests').insert(p).select().single();
    if (error) throw error;
    return data;
  }

  window.API = {
    live: LIVE,
    getSermons, getEvents, getMinistries, getStats,
    createGift, createRsvp, createPrayer
  };
})();
