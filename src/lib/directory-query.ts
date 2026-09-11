import { prisma } from "@/lib/db";
import { searchDirectory, visibleDirectory, type VisibleMember } from "@/lib/directory";

/**
 * Reading the members' directory.
 *
 * The `where` here is belt to `visibleDirectory`'s braces: the query asks the
 * database for listed, authorized rows, and the pure filter runs over what
 * comes back anyway. Two checks rather than one because this is the page where
 * a forgotten condition publishes somebody's phone number, and a `where` is the
 * easiest thing in the file to edit without noticing.
 */
const shape = {
  id: true,
  name: true,
  displayName: true,
  email: true,
  phone: true,
  picture: true,
  authorized: true,
  directoryListed: true,
  directoryShowEmail: true,
  directoryShowPhone: true,
  directoryNote: true,
} as const;

export async function directoryFor(query = ""): Promise<VisibleMember[]> {
  const rows = await prisma.user.findMany({
    where: { directoryListed: true, authorized: true },
    select: shape,
  });
  return searchDirectory(visibleDirectory(rows), query);
}

/** How many people are in it, for the page that links to it. */
export async function directoryCount(): Promise<number> {
  return prisma.user.count({ where: { directoryListed: true, authorized: true } });
}
