import { NextResponse } from "next/server";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import {
  authorizeIdentity,
  normalizeEmail,
  organizationRequired,
  providerFromSub,
  recordAccessAttempt,
} from "@/lib/authorization";

/**
 * The Auth0 client, configured to require membership of the Marine Team
 * organization and to turn every refusal into a friendly page rather than a
 * stack trace.
 *
 * `AUTH0_ORGANIZATION_ID` is passed as an authorization parameter so Auth0
 * itself refuses non-members at the identity provider — a personal Google
 * account never reaches our callback with a usable token. The same value is
 * checked again server-side against the ID token's `org_id` claim (see
 * src/lib/authorization.ts), because a parameter we send is a request and the
 * claim is the proof.
 */
export const auth0 = new Auth0Client({
  authorizationParameters: {
    // Sending the organization makes Auth0 render that org's login and reject
    // anyone outside it.
    //
    // Withheld in ALLOWLIST mode, and that's the point of the condition: Auth0
    // would otherwise refuse non-members at the identity provider, before our
    // own check ever runs, making a mode that doesn't require membership
    // behave exactly like one that does.
    //
    // Also omitted (rather than sent empty) when the id isn't configured, so a
    // misconfigured deployment fails at the org *check* — which fails closed —
    // instead of sending a malformed authorization request.
    ...(organizationRequired() && process.env.AUTH0_ORGANIZATION_ID
      ? { organization: process.env.AUTH0_ORGANIZATION_ID }
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
