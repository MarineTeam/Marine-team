# Auth0 Actions

Source for the Auth0 Actions this app depends on. They live here so they're
reviewable and versioned; Auth0 itself is configured through its dashboard, so
**deploying the app does not deploy these** — see the checklist below.

## The security model

```
authenticated with Auth0
  ↓  member of the Marine Team organization      (org_id claim on the ID token)
  ↓  email ACTIVE in AuthorizedEmail             (PostgreSQL, via Prisma)
  ↓  application access
```

Both checks must pass. Neither is sufficient alone, and neither is ever taken
from something the browser supplied.

| Marine Team member | Authorized email | Result |
| --- | --- | --- |
| no | no | DENY |
| no | yes | DENY |
| yes | no | DENY |
| yes | yes | ALLOW |

Where each is enforced:

- **Organization** — `authorizationParameters.organization` in
  `src/lib/auth0.ts` makes Auth0 refuse non-members at the identity provider,
  and `isOrganizationMember()` re-checks the verified `org_id` claim
  server-side. The parameter is the request; the claim is the proof.
- **Allowlist** — `getCurrentUser()` reads `AuthorizedEmail` on every
  server-rendered page and API request, so removing an email takes effect on
  that person's next request rather than whenever their cookie expires.

## `pre-user-registration.js`

Stops unauthorized emails creating accounts at all.

1. Auth0 Dashboard → **Actions → Library → Build from scratch**
2. Name: `Marine Team registration check`, Trigger: **Pre User Registration**
3. Paste `pre-user-registration.js`
4. Add two **Secrets** (the key icon in the editor):
   - `AUTH0_REGISTRATION_CHECK_URL` — `https://<your-domain>/api/auth/registration-check`
   - `AUTH0_REGISTRATION_CHECK_SECRET` — the same value as the app's
     `AUTH0_REGISTRATION_CHECK_SECRET` env var (generate with `openssl rand -hex 32`)
5. **Deploy**, then drag it into **Actions → Triggers → pre-user-registration**

The Action fails closed: if the endpoint is unreachable, slow (5s timeout), or
answers anything but `{"allowed": true}`, registration is denied.

> This trigger only fires for **database** connections. Social signups
> (Google) do not run it — for those, the organization requirement plus the
> allowlist check in `getCurrentUser()` are what refuse access, which is why
> the allowlist is enforced on every request rather than only at signup.

## `link-accounts.js`

Optional. Merges identities so one person is one Auth0 user — without it,
signing in with Google and later with Microsoft on the same address creates
two Auth0 users with two different `sub` values.

1. Auth0 Dashboard → **Actions → Library → Build from scratch**
2. Name: `Marine Team account linking`, Trigger: **Login / Post Login**
3. Paste `link-accounts.js`
4. Add the `auth0` npm module (the **Modules** panel in the editor)
5. Add three **Secrets**, from a Machine-to-Machine application authorized for
   the Management API with the `read:users` and `update:users` scopes:
   - `AUTH0_DOMAIN` — `your-tenant.eu.auth0.com`
   - `AUTH0_M2M_CLIENT_ID`
   - `AUTH0_M2M_CLIENT_SECRET`
6. **Deploy**, then drag it into **Actions → Triggers → post-login**, above any
   Action that reads the user's identities

It only links when **both** accounts have a verified email. Linking on an
unverified address is the account-takeover path this feature is known for:
anyone able to sign up asserting an existing member's address would be merged
into their account. The application refuses the same case independently
(`decideLinking` in `src/lib/identity-linking.ts`), so this is defence in
depth, not the only guard.

Unlike the registration check, this Action **fails open**. That one guards the
door, so an outage must deny; this one only tidies identities, and the app's
sub-first resolution keeps people on the right member row without it. Blocking
a login because a merge failed would trade a cosmetic problem for a lockout.

When the account that just logged in is the one merged away, the Action calls
`api.authentication.setPrimaryUser()` so the login continues as the surviving
account. Auth0 does not switch the transaction over by itself, and without it
the login finishes as a user that no longer exists on its own. It's called
only *after* `users.link()`, because the API requires the authenticating
identity to already be one of the primary user's secondary identities.

> **The app does not require this Action.** Skip it and members still get one
> account per person, because `getCurrentUser()` links verified identities by
> email itself. What the Action adds is a single stable `sub` per person at the
> Auth0 layer, which keeps sessions and logs consistent across providers.

### Check `email_verified` before relying on any of this

Both the Action and the app refuse to link an identity whose email the
provider hasn't verified, so a connection that doesn't assert the claim
doesn't just skip linking — it means someone signing in that way is **denied
access** if their address already belongs to a member. That is the correct
outcome (it's exactly the takeover case), but it looks like a broken login if
you weren't expecting it.

Auth0 sets `email_verified` to whatever the provider returns, and to `false`
when the provider returns nothing. **GitHub is a known case of this** — Auth0
publishes a support article on `email_verified=False` for GitHub logins, and
the connection generally needs the `user:email` scope before verified address
information is available at all.

Before enabling a second connection, sign in with it once and check that
user's profile in **User Management → Users** shows `email_verified: true`.
If it doesn't, fix the connection's scopes rather than relaxing the rule.

## Dashboard checklist

- Organizations enabled; **Marine Team** exists and its id is in the app's
  `AUTH0_ORGANIZATION_ID`.
- Application → Organizations: usage **Require Organization Membership**,
  and the Google connection is enabled **for the organization**.
- Allowed Callback URLs: `https://<your-domain>/auth/callback`.
  Allowed Logout URLs: `https://<your-domain>`.
- The registration check Action is deployed and attached to the
  pre-user-registration flow.
- Optionally, the account-linking Action is deployed and attached to the
  post-login flow, with its M2M application authorized for `read:users` and
  `update:users`.

## A note on the callback errors

Two errors are *expected* when someone tries a personal account, and neither
means the cookie configuration is broken:

- `invalid_request (client requires organization membership, but user does not
  belong to any organization)` — the organization requirement doing its job.
- `Missing state cookie from login request` — usually a stale or re-played
  callback URL (a refresh, a bookmarked `/auth/callback`, or a second attempt
  after the first consumed the transaction cookie).

Both are caught by the `onCallback` hook in `src/lib/auth0.ts` and turned into
`/access-denied`. State and nonce validation are untouched — the fix is to
present the error nicely, not to stop checking.
