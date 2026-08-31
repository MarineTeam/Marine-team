import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { hymnNumberOf } from "@/lib/toc-nav";

/**
 * Stores a book's own contents — what its PDF's bookmarks say, resolved to
 * pages — so a whole shelf of hymnals can be searched at once.
 *
 * The resolving happens in the admin's browser (pdf.js is where that
 * knowledge lives; see derivePdfBook) and the result is sent here whole, the
 * same way a service plan's running order is: a contents list is one thing,
 * and replacing it beats reconciling six hundred rows against six hundred
 * others.
 *
 * The hymn number is parsed *here* rather than sent, so the one rule for
 * reading "214" off a label lives in one place and a reindex picks up any
 * change to it.
 */
const schema = z.object({
  entries: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        // A contents entry whose destination didn't resolve has no page and
        // nothing to search for; the client drops those before sending.
        page: z.number().int().min(1),
        depth: z.number().int().min(0).max(20).optional(),
      }),
    )
    // A hymnal runs to hundreds of entries; a thousand is already well past
    // anything real, and past what one request should carry.
    .max(2000),
});

/**
 * What is indexed now, for the editor to open.
 *
 * Staff-only like the PUT beside it: a book's contents are public through
 * search, but the editable list — including entries on unpublished books —
 * is the admin's working copy of them.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;

    const file = await prisma.fileAsset.findUnique({
      where: { id },
      select: { id: true, seriesId: true, categoryId: true, pageOffset: true, contentsIndexedAt: true },
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    const entries = await prisma.bookHymn.findMany({
      where: { fileId: id },
      select: { title: true, number: true, page: true },
      orderBy: { position: "asc" },
    });

    return NextResponse.json({
      entries,
      pageOffset: file.pageOffset,
      indexedAt: file.contentsIndexedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const file = await prisma.fileAsset.findUnique({
      where: { id },
      select: { id: true, title: true, seriesId: true, categoryId: true },
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    await prisma.$transaction(async (tx) => {
      await tx.bookHymn.deleteMany({ where: { fileId: id } });
      if (body.entries.length > 0) {
        await tx.bookHymn.createMany({
          data: body.entries.map((entry, position) => ({
            fileId: id,
            title: entry.title.trim(),
            number: hymnNumberOf(entry.title),
            page: entry.page,
            depth: entry.depth ?? 0,
            position,
          })),
        });
      }
      await tx.fileAsset.update({
        where: { id },
        data: { contentsIndexedAt: new Date() },
      });
    });

    await logAudit(user.email, "index-contents", "file", id, `${file.title}: ${body.entries.length} entries`);
    return NextResponse.json({ indexed: body.entries.length });
  } catch (error) {
    return errorResponse(error);
  }
}
