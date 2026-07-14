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

  // ---- Auth0 (member / staff login) ----
  // Application (SPA) → Settings. Add your deploy URL to Allowed
  // Callback URLs, Logout URLs, and Web Origins.
  auth0: {
    domain: 'YOUR_AUTH0_DOMAIN',         // e.g. your-tenant.us.auth0.com
    clientId: 'YOUR_AUTH0_CLIENT_ID'
  },

  // ---- bunny.net (media CDN: sermon video + images) ----
  // Pull Zone hostname; assets referenced as `${pullZone}/path`.
  bunny: {
    pullZone: 'YOUR_PULLZONE.b-cdn.net',
    streamLibraryId: '' // optional: bunny Stream library id for HLS
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
