import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * Returns the logged-in user's session + a synced local User row, creating
 * one on first login. Role is granted via ADMIN_EMAILS on every login so an
 * operator can promote/demote an admin just by editing the env var.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth0.getSession();
  if (!session?.user?.sub || !session.user.email) {
    return null;
  }

  const { sub, email, name, picture } = session.user;
  const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? "ADMIN" : "MEMBER";

  return prisma.user.upsert({
    where: { auth0Id: sub },
    create: { auth0Id: sub, email, name, picture, role },
    update: { email, name, picture, role },
  });
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}
