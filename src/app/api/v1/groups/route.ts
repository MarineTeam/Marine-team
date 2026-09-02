import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, withKey } from "@/lib/api-v1";

/**
 * Small groups, and how full each one is.
 *
 * **Never the address, and never who is in one.** A group meets in somebody's
 * living room, and this app's rule is that the address travels only with a
 * leader's yes — an API key is not that yes, and a machine cannot be told one
 * later. There is deliberately no scope that would return it, so this is not a
 * permission somebody can grant by mistake.
 *
 * The member list is out for the same reason: a directory of who is in which
 * home group is a different thing from a directory of groups.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("groups:read", async ({ url }) => {
  const page = pageFrom(url);
  const rows = await prisma.smallGroup.findMany({
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      meetsWhen: true,
      // `area` is a district and safe to print; `address` is a house and is
      // not selected here or anywhere in this API.
      area: true,
      published: true,
      openToJoin: true,
      waitlist: true,
      capacity: true,
      createdAt: true,
      updatedAt: true,
      members: { select: { status: true } },
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    kept.map(({ members, ...group }) => ({
      ...group,
      memberCount: members.filter((member) => member.status === "ACTIVE").length,
      requestedCount: members.filter((member) => member.status === "REQUESTED").length,
      waitingCount: members.filter((member) => member.status === "WAITLIST").length,
    })),
    { nextCursor },
  );
});
