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

  async function init() {
    if (!enabled) return null;
    try {
      const { createAuth0Client } = await import('https://esm.sh/@auth0/auth0-spa-js@2');
      client = await createAuth0Client({
        domain: C.auth0.domain,
        clientId: C.auth0.clientId,
        authorizationParams: { redirect_uri: window.location.origin }
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
      return null;
    }
  }

  async function login() {
    if (!enabled) return;
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
