import { NextResponse } from "next/server";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import {
  allowedOrganizationIds,
  authorizeIdentity,
  normalizeEmail,
  organizationRequired,
  providerFromSub,
  recordAccessAttempt,
} from "@/lib/authorization";

/**
 * The Auth0 client, configured to require membership of one of this
 * deployment's accepted organizations and to turn every refusal into a
 * friendly page rather than a stack trace.
 *
 * When exactly one organization is configured, its id is passed as an
 * authorization parameter so Auth0 renders that org's login directly and
 * refuses everyone else at the identity provider — a personal Google account
 * never reaches our callback with a usable token. With two or more configured,
 * the parameter is left out instead, which is what makes Auth0 show its own
 * organization picker rather than assuming one. Either way, the organization
 * the member ends up with is checked again server-side against the ID token's
 * `org_id` claim (see isOrganizationMember in src/lib/authorization.ts),
 * because a parameter we send is a request and the claim is the proof — a
 * picker choice made in the browser is never trusted on its own.
 */
export const auth0 = new Auth0Client({
  authorizationParameters: {
    // Withheld in ALLOWLIST mode, and that's the point of the condition: Auth0
    // would otherwise refuse non-members at the identity provider, before our
    // own check ever runs, making a mode that doesn't require membership
    // behave exactly like one that does.
    //
    // Also withheld with zero or with more than one organization configured:
    // zero should fail at the org *check* (which fails closed) rather than
    // send a malformed authorization request, and more than one is exactly
    // when Auth0's own organization prompt is wanted instead of us picking
    // for the member.
    ...(organizationRequired() && allowedOrganizationIds().length === 1
      ? { organization: allowedOrganizationIds()[0] }
      : {}),
  },

  /**
   * Runs at the end of the callback, before the app is handed back to the
   * browser. Two jobs:
   *
   *  1. Turn an Auth0-side failure into `/access-denied`. The common ones are
   *     an organization rejection ("client requires organization membership,
   *     but user does not belong to any organization") and a missing state
   *     cookie — both of which are *expected* when someone tries a personal
   *     account, and neither of which should ever show a raw
   *     CallbackHandlerError to a visitor.
   *  2. Apply the database half of the model. Someone can be a genuine
   *     organization member and still not be on the allowlist.
   *
   * Returning a redirect from here does not by itself stop the SDK writing a
   * session cookie onto that response — it sets the cookie after this hook
   * returns. src/proxy.ts strips it, which is what makes "no session is
   * created on failure" actually true.
   */
  async onCallback(error, ctx, session) {
    const appBaseUrl = ctx.appBaseUrl ?? process.env.APP_BASE_URL ?? "";

    if (error) {
      // No identity to attribute this to: Auth0 refused before we saw one.
      await recordAccessAttempt({
        attemptType: "LOGIN",
        organizationMember: false,
        emailAuthorized: false,
        reason: "AUTH0_CALLBACK_ERROR",
      });
      return NextResponse.redirect(new URL("/access-denied?reason=login_failed", appBaseUrl));
    }

    const email = session?.user?.email ? normalizeEmail(session.user.email) : null;
    const decision = await authorizeIdentity({ email, orgId: session?.user?.org_id });

    if (!decision.allowed) {
      await recordAccessAttempt({
        email,
        auth0UserId: session?.user?.sub ?? null,
        provider: providerFromSub(session?.user?.sub),
        attemptType: "LOGIN",
        organizationMember: decision.organizationMember,
        emailAuthorized: decision.emailAuthorized,
        reason: decision.reason,
      });
      return NextResponse.redirect(new URL("/access-denied?reason=not_authorized", appBaseUrl));
    }

    return NextResponse.redirect(new URL(ctx.returnTo ?? "/", appBaseUrl));
  },
});
