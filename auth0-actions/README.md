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

## Dashboard checklist

- Organizations enabled; **Marine Team** exists and its id is in the app's
  `AUTH0_ORGANIZATION_ID`.
- Application → Organizations: usage **Require Organization Membership**,
  and the Google connection is enabled **for the organization**.
- Allowed Callback URLs: `https://<your-domain>/auth/callback`.
  Allowed Logout URLs: `https://<your-domain>`.
- The Action above is deployed and attached to the pre-user-registration flow.

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
