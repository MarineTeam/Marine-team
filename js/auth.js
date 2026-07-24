/* ============================================================
   Auth0 wrapper (optional).
   Enabled only when CONFIG.auth0 is filled in. Loads the Auth0
   SPA SDK from CDN and exposes a tiny interface used by app.js.
   In mock mode this is a disabled no-op.
   ============================================================ */
(function () {
  const C = window.CONFIG;
  const enabled = C.flags.auth0;
  let client = null;
  let user = null;
  let initPromise = null;

  // The Auth0 SDK loads from a CDN at runtime; if that request stalls
  // (flaky network, blocked request) a bare `await import(...)` never
  // resolves *or* rejects, which would hang init() — and login — forever.
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);

  async function init() {
    if (!enabled) return null;
    if (initPromise) return initPromise; // avoid firing the CDN import twice concurrently
    initPromise = (async () => {
      try {
        const { createAuth0Client } = await withTimeout(
          import('https://esm.sh/@auth0/auth0-spa-js@2'), 6000, 'Loading the Auth0 SDK'
        );
        client = await createAuth0Client({
          domain: C.auth0.domain,
          clientId: C.auth0.clientId,
          authorizationParams: { redirect_uri: window.location.origin },
          // Persist the session across reloads, and use refresh tokens so
          // getTokenSilently() works without third-party cookies (Safari/Brave/etc).
          cacheLocation: 'localstorage',
          useRefreshTokens: true
        });
        // Handle the redirect back from Auth0
        const q = window.location.search;
        if (q.includes('code=') && q.includes('state=')) {
          await client.handleRedirectCallback();
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
        if (await client.isAuthenticated()) user = await client.getUser();
        return user;
      } catch (e) {
        console.warn('Auth0 init failed; continuing unauthenticated.', e);
        client = null;
        initPromise = null; // allow a later login click to retry
        return null;
      }
    })();
    return initPromise;
  }

  async function login() {
    if (!enabled) return;
    if (!client) await init(); // e.g. init() failed earlier or hasn't run yet
    if (!client) throw new Error('Member login is unavailable right now — please try again in a moment.');
    await client.loginWithRedirect();
  }
  // Access token for calling our own /api/embed (which verifies it via Auth0 /userinfo).
  async function getToken() {
    if (!enabled || !client) return null;
    try { return await client.getTokenSilently(); }
    catch (e) { console.warn('getTokenSilently failed', e); return null; }
  }
  async function logout() {
    if (!enabled) return;
    await client.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  window.Auth = {
    get enabled() { return enabled; },
    get user() { return user; },
    init, login, logout, getToken
  };
})();
