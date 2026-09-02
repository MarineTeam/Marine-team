import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, withKey } from "@/lib/api-v1";

/**
 * Files — books, music, service sheets.
 *
 * `bunnyPath` is not here. It is where the object lives in storage, which is a
 * detail of this deployment rather than a fact about the file, and publishing
 * it hands somebody the shape of the bucket. `url` is what a reader wants.
 *
 * The filter is `addedSince`, not `updatedSince` like everywhere else, because
 * `FileAsset` has no `updatedAt` column — a file is replaced rather than
 * edited. Calling it the same thing and quietly matching on creation would let
 * a sync job believe it had seen every change.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("content:read", async ({ url }) => {
  const page = pageFrom(url);
  const raw = url.searchParams.get("addedSince");
  const since = raw && !Number.isNaN(new Date(raw).getTime()) ? new Date(raw) : undefined;
  const seriesId = url.searchParams.get("seriesId");

  const rows = await prisma.fileAsset.findMany({
    where: {
      deletedAt: null,
      ...(seriesId ? { seriesId } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      title: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      seriesId: true,
      position: true,
      pageNumber: true,
      groupLabel: true,
      ccliNumber: true,
      songAuthor: true,
      songCopyright: true,
      musicalKey: true,
      published: true,
      hidden: true,
      memberOnly: true,
      createdAt: true,
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(kept, { nextCursor });
});
