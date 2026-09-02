import { prisma } from "@/lib/db";
import { ok, withKey } from "@/lib/api-v1";

/**
 * Totals, for a dashboard somebody keeps elsewhere.
 *
 * Counts only. There is no per-member history here and no endpoint that would
 * give one: "who watched what" is the most sensitive thing this app holds
 * about somebody, and an aggregate is what a report actually needs.
 *
 * Not paged, because it is one object rather than a list.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("analytics:read", async ({ url }) => {
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);

  const [categories, series, videos, files, members, events, groups, viewsInWindow, topVideos] = await Promise.all([
    prisma.category.count({ where: { deletedAt: null } }),
    prisma.series.count({ where: { deletedAt: null } }),
    prisma.video.count({ where: { deletedAt: null } }),
    prisma.fileAsset.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { authorized: true } }),
    prisma.event.count(),
    prisma.smallGroup.count(),
    prisma.viewEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.viewEvent.groupBy({
      by: ["videoId"],
      where: { createdAt: { gte: since }, videoId: { not: null } },
      _count: { videoId: true },
      orderBy: { _count: { videoId: "desc" } },
      take: 10,
    }),
  ]);

  // Titles are fetched separately rather than joined in the groupBy, which
  // Prisma cannot do — and looked up in one query rather than ten.
  const ids = topVideos.flatMap((row) => (row.videoId ? [row.videoId] : []));
  const titles = new Map(
    (await prisma.video.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })).map((row) => [
      row.id,
      row.title,
    ]),
  );

  return ok({
    windowDays: days,
    totals: { categories, series, videos, files, members, events, groups },
    views: {
      inWindow: viewsInWindow,
      topVideos: topVideos.map((row) => ({
        videoId: row.videoId,
        title: row.videoId ? (titles.get(row.videoId) ?? null) : null,
        views: row._count.videoId,
      })),
    },
  });
});
