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
import { decideLinking } from "@/lib/identity-linking";
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
  /**
   * Whether the identity provider says it verified this address. Governs
   * whether a *new* identity may attach itself to an existing member — see
   * decideLinking. Absent means not verified: a claim that isn't made isn't
   * a claim that's true.
   */
  emailVerified: boolean;
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
    emailVerified: session.user.email_verified === true,
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

  const { sub, email, orgId } = identity;
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
  return resolveUserForIdentity(identity, isBootstrapAdmin);
});

/**
 * Maps a verified Auth0 identity onto a member row, creating or linking as
 * decideLinking() dictates, and records the identity itself.
 *
 * Replaces an `upsert({ where: { email } })` that wrote `auth0Id: sub` on
 * every login. That had two faults. It treated email as the identifier, so
 * an email change at the provider looked like a brand-new person — and
 * because `auth0Id` is unique, the create it then attempted collided with
 * the old row and threw P2002, turning a login into a 500 rather than a
 * denial. And it linked any identity presenting a known address, verified or
 * not, which hands an existing member's row (and role) to whoever asserts
 * their email.
 */
async function resolveUserForIdentity(
  identity: SessionIdentity,
  isBootstrapAdmin: boolean,
): Promise<User | null> {
  const { sub, email, name, picture, emailVerified } = identity;

  const [identityRow, userByEmail] = await Promise.all([
    prisma.userIdentity.findUnique({ where: { sub }, select: { userId: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  const decision = decideLinking(
    { sub, email, emailVerified },
    { userIdBySub: identityRow?.userId ?? null, userIdByEmail: userByEmail?.id ?? null },
  );

  if (decision.action === "refuse") {
    // Deliberately indistinguishable from any other denial to the person
    // trying: telling them the address is taken confirms a member exists.
    console.warn(`Refused to link unverified identity ${sub} to existing email ${email}`);
    return null;
  }

  const shared = {
    name,
    picture,
    authorized: true,
    auth0Id: sub,
    ...(isBootstrapAdmin ? { role: "ADMIN" as const } : {}),
  };

  // User.email is unique too, so renaming a row onto an address another row
  // already holds would just swap P2002 on auth0Id for P2002 on email. That
  // happens when someone changes their provider email to one a second member
  // row is already using. Sign-in still succeeds — sub identified them — but
  // the rename is skipped and left for a human, since merging two member rows
  // means deciding which history to keep and isn't something to do silently.
  // "create" has no target row yet, and reached that branch precisely
  // because no row holds this email — so there is nothing to collide with.
  const targetUserId = decision.action === "create" ? null : decision.userId;
  const emailBelongsElsewhere = Boolean(targetUserId && userByEmail && userByEmail.id !== targetUserId);
  if (emailBelongsElsewhere) {
    console.warn(`Kept existing email for user ${targetUserId}: ${email} already belongs to another member`);
  }

  const user =
    decision.action === "create"
      ? await prisma.user.create({
          data: { ...shared, email, role: isBootstrapAdmin ? "ADMIN" : "MEMBER" },
        })
      : await prisma.user.update({
          where: { id: decision.userId },
          // For the "existing" branch, writing email is what makes a
          // provider-side change a rename of the member we already know
          // rather than stranding their history on the old row.
          data: { ...shared, ...(emailBelongsElsewhere ? {} : { email }) },
        });

  await prisma.userIdentity.upsert({
    where: { sub },
    create: {
      userId: user.id,
      sub,
      provider: providerFromSub(sub) ?? "unknown",
      email,
      emailVerified,
      lastLoginAt: new Date(),
    },
    update: { email, emailVerified, lastLoginAt: new Date(), userId: user.id },
  });

  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
