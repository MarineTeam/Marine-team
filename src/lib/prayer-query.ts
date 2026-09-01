import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";
import { visibleTo, type Viewer, type VisiblePrayer } from "@/lib/prayer";
import type { User } from "@prisma/client";

/**
 * Reading the prayer wall.
 *
 * Separate from lib/prayer.ts because the wall itself is a client component
 * and a value imported from a module that reaches Prisma bundles the whole
 * client into the browser — see client-bundle.test.ts.
 *
 * Every function here funnels through `visibleTo`, and none of them selects a
 * `userId` into anything it returns. That is the point: there is one place a
 * name can escape, and it is `bylineFor`.
 */

export async function viewerFor(user: User | null): Promise<Viewer> {
  return {
    userId: user?.id ?? null,
    moderates: user ? await hasCapability(user, "moderate_prayer") : false,
  };
}

/** The wall, as this reader may see it. Newest first; answered ones travel with the rest. */
export async function listPrayers(viewer: Viewer, limit = 100): Promise<VisiblePrayer[]> {
  const requests = await prisma.prayerRequest.findMany({
    // Narrowed here for the query planner's sake; `visibleTo` is still what
    // decides, so a widening of this filter can't widen who sees what.
    where: viewer.moderates
      ? {}
      : {
          OR: [
            { status: { in: ["APPROVED", "ANSWERED"] } },
            ...(viewer.userId ? [{ userId: viewer.userId }] : []),
          ],
        },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { prayers: { select: { userId: true } } },
  });
  return visibleTo(requests, viewer);
}

/** How many are waiting to be let through, for the badge on the admin link. */
export async function pendingPrayerCount(): Promise<number> {
  return prisma.prayerRequest.count({ where: { status: "PENDING" } });
}
