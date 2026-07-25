import { cache } from "react";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export type SessionIdentity = { email: string; name: string | null; picture: string | null };

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
    email: session.user.email.toLowerCase(),
    name: session.user.name ?? null,
    picture: session.user.picture ?? null,
  };
});

/**
 * Records every Auth0 login attempt as a User row (so admins can see it at
 * /admin/users and decide whether to grant access), but only returns a
 * user — meaning "treat as logged in" — once `authorized` is true. A brand
 * new row starts unauthorized unless the email is in ADMIN_EMAILS, which
 * self-authorizes as ADMIN so there's always a way in.
 *
 * A single `upsert` (no separate `findUnique` first): the `update` branch
 * only sets `role`/`authorized` when forcing bootstrap-admin status, so a
 * returning non-bootstrap user's existing values are left untouched by
 * simply not naming those keys, rather than reading them first to echo
 * them back. Wrapped in React's `cache()` so the ~30 call sites across the
 * app (Navbar on every page, each page itself, admin layout, ...) share
 * one query per request instead of hitting the DB 2-3x per request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) return null;

  const { sub, name, picture } = session.user;
  const email = session.user.email.toLowerCase();
  const isBootstrapAdmin = ADMIN_EMAILS.includes(email);

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
      ...(isBootstrapAdmin ? { role: "ADMIN" as const, authorized: true } : {}),
    },
  });

  return user.authorized ? user : null;
});

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
