import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { allowedOrganizationIds, isGuestLoginEnabled, organizationRequired } from "@/lib/authorization";

/**
 * Starts a login that deliberately does *not* name an organization, for
 * someone invited as a guest.
 *
 * Why this route has to exist at all: when an organization is configured and
 * required, src/lib/auth0.ts sends `organization` on the authorization
 * request, which makes Auth0 itself refuse non-members at the identity
 * provider — before the callback, and so before `authorizeIdentity` ever runs.
 * A guest's `organizationExempt` allowlist row is checked inside that
 * function, so via the normal /auth/login a guest would never reach the code
 * that is supposed to let them in. Omitting the parameter is the only way
 * their login can get far enough to be judged on the allowlist.
 *
 * `organization: undefined` removes the value the client was constructed with
 * rather than overriding it: the SDK merges per-request parameters over the
 * constructor's and then skips any whose value is null/undefined, so nothing
 * is sent (an empty string would be sent, and rejected).
 *
 * This grants nothing by itself. It only changes which login screen Auth0
 * shows; whether the person is let in is still decided afterwards by
 * authorizeIdentity, which under BOTH mode admits them only if their address
 * has an ACTIVE, organizationExempt row. Someone without one authenticates and
 * is then refused at /access-denied exactly as before.
 *
 * Requires the Auth0 Application's "Type of Users" to be "Both" (Login
 * Experience tab) — otherwise Auth0 insists on an organization even when we
 * stop asking for one, and this route fails the same way the normal one does.
 *
 * Also gated on `isGuestLoginEnabled()` (toggled at /admin/authorized-emails,
 * off by default): there's no reason to leave an alternate, org-skipping
 * login path live once the guest who needed it is done, and every additional
 * always-on entry point is something to have to reason about. Closed, this
 * 404s the same as the "no organization required" case below, so the
 * response itself doesn't advertise that a guest path exists at all.
 */
export async function GET(request: NextRequest) {
  // Pointless when no organization is being demanded in the first place: the
  // normal login already omits `organization`, so this would be a second
  // identical entry point. 404 rather than silently duplicating it.
  if (!organizationRequired() || allowedOrganizationIds().length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await isGuestLoginEnabled())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;

  // returnTo is sanitized by the SDK (toSafeRedirect against the app's own
  // base URL), so an attacker-supplied absolute URL can't turn this into an
  // open redirect.
  return auth0.startInteractiveLogin({
    authorizationParameters: { organization: undefined },
    returnTo,
  });
}
