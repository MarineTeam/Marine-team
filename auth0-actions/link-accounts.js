/**
 * Auth0 Action — Post Login (account linking)
 *
 * Merges identities so one person is one Auth0 user. Without this, signing in
 * with Google and later with GitHub on the same address produces two separate
 * Auth0 users with two different `sub` values, and the application has to
 * reconcile them by email afterwards.
 *
 * Paste this into Auth0 (Actions -> Library -> Build from scratch, trigger
 * "Login / Post Login") and add it to the Login flow. It must run BEFORE any
 * Action that reads the user's identities.
 *
 * Required Action Secrets (a Machine-to-Machine app authorized for the
 * Management API, with the `read:users` and `update:users` scopes):
 *   AUTH0_DOMAIN         your-tenant.eu.auth0.com
 *   AUTH0_M2M_CLIENT_ID
 *   AUTH0_M2M_CLIENT_SECRET
 *
 * No npm modules to add: this calls the Management API over plain `fetch`,
 * the same way pre-user-registration.js calls the app. The `auth0` SDK would
 * do the same work, but its availability in the Actions runtime isn't
 * dependable and its v3 and v4 APIs differ enough that pasting the wrong one
 * fails at runtime rather than in the editor.
 *
 * Fails OPEN, unlike the pre-user-registration Action, and the difference is
 * deliberate. That one guards the door, so an outage must deny. This one only
 * tidies identities: if it can't run, the person still signs in, and the
 * application's own sub-first resolution (src/lib/current-user.ts) keeps them
 * on the right member row anyway. Blocking a login because a merge failed
 * would trade a cosmetic problem for a lockout.
 */

const TIMEOUT_MS = 5000;

async function api(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${options.method || "GET"} ${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

exports.onExecutePostLogin = async (event, api_) => {
  const { AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET } = event.secrets;
  if (!AUTH0_DOMAIN || !AUTH0_M2M_CLIENT_ID || !AUTH0_M2M_CLIENT_SECRET) return;

  // Linking on an unverified email is the account-takeover path this whole
  // feature is known for: anyone able to sign up asserting someone else's
  // address would be merged into their account. The application refuses the
  // same case (decideLinking in src/lib/identity-linking.ts) — this is the
  // same rule enforced one layer earlier.
  if (!event.user.email || event.user.email_verified !== true) return;

  // Already the result of a previous merge: nothing to do, and re-checking
  // would mean two Management API calls on every single login.
  if (Array.isArray(event.user.identities) && event.user.identities.length > 1) return;

  try {
    const base = `https://${AUTH0_DOMAIN}`;

    const token = await api(`${base}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: AUTH0_M2M_CLIENT_ID,
        client_secret: AUTH0_M2M_CLIENT_SECRET,
        audience: `${base}/api/v2/`,
      }),
    });

    const authHeaders = {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    };

    const matches = await api(
      `${base}/api/v2/users-by-email?email=${encodeURIComponent(event.user.email)}`,
      { headers: authHeaders },
    );

    const candidates = (matches || []).filter(
      (candidate) =>
        candidate.user_id !== event.user.user_id &&
        // Both sides have to be verified. An unverified *existing* account is
        // just as unsafe to merge into as an unverified incoming one.
        candidate.email_verified === true,
    );
    if (candidates.length === 0) return;

    // Merge into the oldest account, so the identity people have been using
    // longest stays primary and keeps its user_id. The app tolerates either
    // outcome — it resolves by sub — but a stable primary means the `sub` in
    // existing sessions and logs keeps meaning the same person.
    candidates.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const oldest = candidates[0];

    const oldestIsOlder = new Date(oldest.created_at) <= new Date(event.user.created_at);
    const [target, source] = oldestIsOlder ? [oldest, event.user] : [event.user, oldest];

    const sourceIdentity = (source.identities || [])[0];
    if (!sourceIdentity) return;

    await api(`${base}/api/v2/users/${encodeURIComponent(target.user_id)}/identities`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        provider: sourceIdentity.provider,
        user_id: String(sourceIdentity.user_id),
      }),
    });

    // When the account that just logged in is the one merged away, its sub no
    // longer exists as a user of its own — it's now a secondary identity of
    // `target`. Auth0 does not switch the transaction over on its own, so
    // without this the login finishes as a user that isn't there any more.
    //
    // Safe precisely here and not before: the API requires the authenticating
    // identity to already be among the primary user's secondary identities,
    // which the link call above has just made true.
    if (target.user_id !== event.user.user_id) {
      api_.authentication.setPrimaryUser(target.user_id);
    }
  } catch (error) {
    // Logged for the Action's own log stream only; never surfaced to the
    // person, and never a reason to block the login.
    console.log(`Account linking skipped: ${error && error.message}`);
  }
};
