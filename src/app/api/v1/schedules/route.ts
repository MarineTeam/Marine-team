import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, withKey } from "@/lib/api-v1";

/** The rotas this deployment keeps. Dates are on /api/v1/calendar-events. */
export const dynamic = "force-dynamic";

export const GET = withKey("calendar:read", async ({ url }) => {
  const page = pageFrom(url);
  const rows = await prisma.schedule.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      color: true,
      enabled: true,
      displayOrder: true,
      sourceType: true,
      createdAt: true,
      _count: { select: { events: true } },
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    kept.map(({ _count, ...row }) => ({ ...row, eventCount: _count.events })),
    { nextCursor },
  );
});
