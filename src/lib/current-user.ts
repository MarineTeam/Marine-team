import { cache } from "react";
import { headers } from "next/headers";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import {
  authorizeIdentity,
  clientIpFrom,
  normalizeEmail,
  providerFromSub,
  recordAccessAttempt,
} from "@/lib/authorization";
import type { User } from "@prisma/client";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export type SessionIdentity = {
  email: string;
  name: string | null;
  picture: string | null;
  /** The organization claim from the verified ID token — never anything the browser sent. */
  orgId: string | null;
  sub: string;
};

/**
 * Returns the raw Auth0 identity for whoever is logged in to Auth0,
 * authorized or not. Wrapped in React's `cache()` so the many call sites
 * that each need this (root layout's Navbar, every page, admin layout...)
 * share one result per request instead of re-deriving it independently —
 * this alone doesn't touch the DB, but see getCurrentUser below.
 */
export const getSessionIdentity = cache(async (): Promise<SessionIdentity | null> => {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) return null;
  return {
    email: normalizeEmail(session.user.email),
    name: session.user.name ?? null,
    picture: session.user.picture ?? null,
    orgId: session.user.org_id ?? null,
    sub: session.user.sub,
  };
});

/**
 * Resolves the member behind the current request, or null — and null is the
 * only thing the rest of the app ever needs to know about a failed
 * authorization.
 *
 * Two independent checks, both of which must pass (see
 * src/lib/authorization.ts):
 *
 *  1. **Organization membership**, from the `org_id` claim of the ID token the
 *     Auth0 SDK has already verified.
 *  2. **The email allowlist** in PostgreSQL.
 *
 * Because both are re-evaluated here, and this runs server-side on every page
 * and API request, revoking an email takes effect on that member's *next
 * request* — an already-issued session cookie buys nothing. That's the whole
 * reason the check lives at this choke point rather than only at login.
 *
 * `User.authorized` is kept in step with the answer, so the many existing
 * queries that filter on it (notification fan-out, admin lists) stay correct
 * without every one of them learning about the allowlist.
 *
 * Wrapped in React's `cache()` so the ~30 call sites across a single request
 * share one evaluation rather than each hitting the database.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const identity = await getSessionIdentity();
  if (!identity) return null;

  const { sub, name, picture, email, orgId } = identity;
  const decision = await authorizeIdentity({ email, orgId });

  if (!decision.allowed) {
    // Record the attempt so an administrator can see it, but only once an
    // hour per email: a revoked member with the site open in a tab would
    // otherwise write a row on every poll.
    const requestHeaders = await headers().catch(() => null);
    await recordAccessAttempt({
      email,
      auth0UserId: sub,
      provider: providerFromSub(sub),
      attemptType: "SESSION",
      organizationMember: decision.organizationMember,
      emailAuthorized: decision.emailAuthorized,
      reason: decision.reason,
      ipAddress: requestHeaders ? clientIpFrom(requestHeaders) : null,
      userAgent: requestHeaders?.get("user-agent") ?? null,
      dedupeMinutes: 60,
    });

    // Demote any existing row so the rest of the app — which reads
    // `authorized` directly in places — agrees with this decision.
    await prisma.user.updateMany({ where: { email, authorized: true }, data: { authorized: false } });
    return null;
  }

  // Authorized: keep the row in sync with the session, and with the fact that
  // the allowlist currently says yes.
  const isBootstrapAdmin = ADMIN_EMAILS.includes(email);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      auth0Id: sub,
      email,
      name,
      picture,
      role: isBootstrapAdmin ? "ADMIN" : "MEMBER",
      authorized: true,
    },
    update: {
      auth0Id: sub,
      name,
      picture,
      authorized: true,
      ...(isBootstrapAdmin ? { role: "ADMIN" as const } : {}),
    },
  });

  return user;
});

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
