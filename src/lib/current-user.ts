import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export type SessionIdentity = { email: string; name: string | null; picture: string | null };

/** Returns the raw Auth0 identity for whoever is logged in to Auth0, authorized or not. */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) return null;
  return {
    email: session.user.email.toLowerCase(),
    name: session.user.name ?? null,
    picture: session.user.picture ?? null,
  };
}

/**
 * Returns the local User row for the current Auth0 session, or null if
 * nobody is logged in to Auth0 OR they aren't authorized: authorization
 * means either a row already exists for their email (added ahead of time
 * via /admin/users) or their email is in ADMIN_EMAILS. Auth0 login proves
 * identity, not that we let someone in — an authenticated-but-unlisted
 * email never gets a User row and is treated as logged out everywhere.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) return null;

  const { sub, name, picture } = session.user;
  const email = session.user.email.toLowerCase();
  const isBootstrapAdmin = ADMIN_EMAILS.includes(email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing && !isBootstrapAdmin) {
    return null;
  }

  return prisma.user.upsert({
    where: { email },
    create: { auth0Id: sub, email, name, picture, role: isBootstrapAdmin ? "ADMIN" : "MEMBER" },
    update: {
      auth0Id: sub,
      name,
      picture,
      role: isBootstrapAdmin ? "ADMIN" : existing?.role,
    },
  });
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
