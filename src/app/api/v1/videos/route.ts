import { prisma } from "@/lib/db";
import { ok, pageArgs, pageFrom, pageOut, updatedSince, withKey } from "@/lib/api-v1";

/**
 * Videos.
 *
 * The transcript is deliberately not in the list: it is the largest column in
 * the database and a page of twenty-five would be megabytes, most of it
 * unwanted. `hasTranscript` says whether there is one to ask for.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("content:read", async ({ url }) => {
  const page = pageFrom(url);
  const since = updatedSince(url);
  const seriesId = url.searchParams.get("seriesId");
  const categoryId = url.searchParams.get("categoryId");

  const rows = await prisma.video.findMany({
    where: {
      deletedAt: null,
      ...(seriesId ? { seriesId } : {}),
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
      source: true,
      externalUrl: true,
      language: true,
      durationSeconds: true,
      status: true,
      seriesId: true,
      categoryId: true,
      speakerId: true,
      scriptureRefs: true,
      position: true,
      published: true,
      hidden: true,
      memberOnly: true,
      publishAt: true,
      unpublishAt: true,
      viewCount: true,
      transcriptStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    kept.map((row) => ({ ...row, hasTranscript: row.transcriptStatus === "done" })),
    { nextCursor },
  );
});
