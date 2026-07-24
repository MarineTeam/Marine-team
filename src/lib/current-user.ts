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
 * Records every Auth0 login attempt as a User row (so admins can see it at
 * /admin/users and decide whether to grant access), but only returns a
 * user — meaning "treat as logged in" — once `authorized` is true. A brand
 * new row starts unauthorized unless the email is in ADMIN_EMAILS, which
 * self-authorizes as ADMIN so there's always a way in.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) return null;

  const { sub, name, picture } = session.user;
  const email = session.user.email.toLowerCase();
  const isBootstrapAdmin = ADMIN_EMAILS.includes(email);

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      auth0Id: sub,
      email,
      name,
      picture,
      role: isBootstrapAdmin ? "ADMIN" : "MEMBER",
      authorized: isBootstrapAdmin,
    },
    update: {
      auth0Id: sub,
      name,
      picture,
      role: isBootstrapAdmin ? "ADMIN" : existing?.role,
      authorized: isBootstrapAdmin ? true : existing?.authorized,
    },
  });

  return user.authorized ? user : null;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
