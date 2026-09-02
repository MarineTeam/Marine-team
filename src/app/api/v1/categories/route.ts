import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, updatedSince, withKey } from "@/lib/api-v1";

/**
 * The catalogue's top level.
 *
 * Soft-deleted rows are absent — trash is not content — but drafts and
 * members-only categories are present, with flags. A key is the organisation
 * reading its own catalogue, and hiding half of it would make the API useless
 * for the migration and reporting jobs it exists for. What a *visitor* may see
 * is a different question, answered on the pages.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("content:read", async ({ url }) => {
  const page = pageFrom(url);
  const since = updatedSince(url);

  const rows = await prisma.category.findMany({
    where: { deletedAt: null, ...(since ? { updatedAt: { gte: since } } : {}) },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      coverImageUrl: true,
      tags: true,
      parentId: true,
      position: true,
      published: true,
      hidden: true,
      memberOnly: true,
      featured: true,
      requireSequential: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(kept, { nextCursor });
});
