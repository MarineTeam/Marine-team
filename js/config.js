/* ============================================================
   Grace Community Church — service configuration
   ------------------------------------------------------------
   Fill these in to connect the free-tier services. Until you do,
   the site runs in MOCK mode (local seed data + localStorage) so
   it works offline and on first clone.

   In production (Vercel) you can inject these at deploy time, or
   just edit the values below. The anon/public keys below are safe
   to ship to the browser — never put service-role or secret keys
   here.
   ============================================================ */
window.CONFIG = {
  church: {
    name: 'Grace Community Church',
    shortName: 'Grace',
    tagline: 'A place to belong, believe, and become.',
    address: '1200 Cedar Ridge Rd, Springfield',
    phone: '(555) 018-2200',
    email: 'hello@gracecommunity.example',
    times: [
      { day: 'Sunday', service: 'Morning Worship', time: '9:00 & 11:00 AM' },
      { day: 'Wednesday', service: 'Midweek + Kids', time: '6:30 PM' }
    ]
  },

  // ---- Supabase (database + REST API) ----
  // Project Settings → API. URL + anon public key.
  supabase: {
    url: 'https://aoyhlyxzhypahtacjlgg.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFveWhseXh6aHlwYWh0YWNqbGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzA1NzAsImV4cCI6MjA5NzE0NjU3MH0.cDKeR3q9H7BXJ-0Uy8pUEDUrDbPYqGy0d5wa0fLwtog'
  },

  // ---- Auth0 (MEMBER login — gates sermon video playback) ----
  // Create a Single Page Application in Auth0. Add your deploy URL to Allowed
  // Callback URLs, Logout URLs, and Web Origins. Members sign in here to watch
  // members-only videos. (Staff admin login is separate — it uses Supabase Auth.)
  auth0: {
    domain: 'YOUR_AUTH0_DOMAIN',         // e.g. your-tenant.us.auth0.com
    clientId: 'YOUR_AUTH0_CLIENT_ID'
  },

  // ---- bunny.net (Stream video CDN) ----
  // The signing key is a SECRET and lives ONLY in Vercel env vars, never here
  // (see api/embed.js). The browser only sends a video GUID to /api/embed and
  // gets back a short-lived signed URL. pullZone is optional (thumbnails).
  bunny: {
    pullZone: 'YOUR_PULLZONE.b-cdn.net',
    streamLibraryId: '' // optional client-side reference; server uses BUNNY_LIBRARY_ID
  }
};

/* --- derive runtime flags: a service is "live" only when configured --- */
(function (c) {
  const set = v => v && !String(v).startsWith('YOUR_');
  // `?mock=1` forces local mode even when keys are present (handy for demos).
  const forceMock = new URLSearchParams(location.search).has('mock');
  c.flags = {
    supabase: !forceMock && set(c.supabase.url) && set(c.supabase.anonKey),
    auth0: !forceMock && set(c.auth0.domain) && set(c.auth0.clientId),
    bunny: !forceMock && set(c.bunny.pullZone)
  };
  c.mock = !c.flags.supabase; // no DB configured → run on local seed data
})(window.CONFIG);
