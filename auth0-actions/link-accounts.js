/**
 * Auth0 Action — Post Login (account linking)
 *
 * Merges identities so one person is one Auth0 user. Without this, signing in
 * with Google and later with Microsoft on the same address produces two
 * separate Auth0 users with two different `sub` values, and the application
 * has to reconcile them by email afterwards.
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
 * Required npm dependency (Action -> Modules): auth0
 *
 * Fails OPEN, unlike the pre-user-registration Action, and the difference is
 * deliberate. That one guards the door, so an outage must deny. This one only
 * tidies identities: if it can't run, the person still signs in, and the
 * application's own sub-first resolution (src/lib/current-user.ts) keeps them
 * on the right member row anyway. Blocking a login because a merge failed
 * would trade a cosmetic problem for a lockout.
 */

// Auth0 Actions run in their own CommonJS sandbox, not in this app's bundle —
// `require` is the only module syntax available there.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ManagementClient } = require("auth0");

exports.onExecutePostLogin = async (event, api) => {
  const { AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET } = event.secrets;
  if (!AUTH0_DOMAIN || !AUTH0_M2M_CLIENT_ID || !AUTH0_M2M_CLIENT_SECRET) return;

  // Linking on an unverified email is the account-takeover path this whole
  // feature is known for: anyone able to sign up asserting someone else's
  // address would be merged into their account. The application refuses the
  // same case (decideLinking in src/lib/identity-linking.ts) — this is the
  // same rule enforced one layer earlier.
  if (!event.user.email || event.user.email_verified !== true) return;

  // Already the result of a previous merge: nothing to do, and re-linking
  // would be a no-op API call on every single login.
  if (Array.isArray(event.user.identities) && event.user.identities.length > 1) return;

  try {
    const management = new ManagementClient({
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_M2M_CLIENT_ID,
      clientSecret: AUTH0_M2M_CLIENT_SECRET,
    });

    const { data: matches } = await management.usersByEmail.getByEmail({ email: event.user.email });

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
    const primary = candidates[0];

    const isPrimaryOlder = new Date(primary.created_at) <= new Date(event.user.created_at);
    const [target, source] = isPrimaryOlder ? [primary, event.user] : [event.user, primary];

    const sourceIdentity = (source.identities || [])[0];
    if (!sourceIdentity) return;

    await management.users.link({ id: target.user_id }, {
      provider: sourceIdentity.provider,
      user_id: String(sourceIdentity.user_id),
    });

    // When the account that just logged in is the one merged away, its sub no
    // longer exists as a user of its own — it's now a secondary identity of
    // `target`. Auth0 does not switch the transaction over on its own, so
    // without this the login finishes as a user that isn't there any more.
    //
    // Safe precisely here and not before: the API requires the authenticating
    // identity to already be among the primary user's secondary identities,
    // which the link() call above has just made true.
    if (target.user_id !== event.user.user_id) {
      api.authentication.setPrimaryUser(target.user_id);
    }
  } catch (error) {
    // Logged for the Action's own log stream only; never surfaced to the
    // person, and never a reason to block the login.
    console.log(`Account linking skipped: ${error && error.message}`);
  }
};
