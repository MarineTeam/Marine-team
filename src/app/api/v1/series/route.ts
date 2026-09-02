import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, updatedSince, withKey } from "@/lib/api-v1";

/** Series, optionally within one category or changed since a moment. */
export const dynamic = "force-dynamic";

export const GET = withKey("content:read", async ({ url }) => {
  const page = pageFrom(url);
  const since = updatedSince(url);
  const categoryId = url.searchParams.get("categoryId");

  const rows = await prisma.series.findMany({
    where: {
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      language: true,
      coverImageUrl: true,
      tags: true,
      categoryId: true,
      position: true,
      published: true,
      hidden: true,
      memberOnly: true,
      featured: true,
      pinned: true,
      publishAt: true,
      unpublishAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(kept, { nextCursor });
});
