import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * The text of a book's pages, sent up as it is read.
 *
 * Reading a six-hundred-page scan takes a browser the better part of an hour
 * — the OCR is the slow part — and a run gets interrupted: a laptop sleeps,
 * a tab is closed, somebody needs the machine. So pages arrive in batches
 * and are stored as they arrive, and GET says which pages are already held,
 * which is what lets the next run pick up rather than start again.
 *
 * The reading itself happens in the admin's browser (see BookTextReader) for
 * the same reason the cover pass does: pdf.js and the OCR engine both run
 * there already, and doing it in a serverless function would mean a wasm
 * build, a canvas, and a minutes-long request.
 */
const schema = z.object({
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        // A blank page is stored as an empty string rather than skipped: it
        // is a page that has been read and found to hold nothing, and the
        // next run shouldn't spend a minute of OCR discovering that again.
        text: z.string().max(200000),
        source: z.enum(["text", "ocr"]),
      }),
    )
    .max(25),
  /** Set on the batch that finishes the book, so a stopped run stays unfinished. */
  finished: z.boolean().optional(),
});

async function bookFor(id: string) {
  return prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, title: true, seriesId: true, categoryId: true, textIndexedAt: true },
  });
}

/** Which pages are already held, so a run resumes rather than repeats. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const file = await bookFor(id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    const pages = await prisma.bookPage.findMany({
      where: { fileId: id },
      select: { page: true, source: true },
      orderBy: { page: "asc" },
    });

    return NextResponse.json({
      done: pages.map((row) => row.page),
      // What the run had to fall back to OCR for — the honest measure of how
      // much of this book is a photograph.
      ocrPages: pages.filter((row) => row.source === "ocr").length,
      textIndexedAt: file.textIndexedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const file = await bookFor(id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    // Upserted one page at a time inside a transaction rather than a
    // createMany: a resumed run can legitimately re-send a page it already
    // sent (the batch it was stopped in the middle of), and that should
    // replace it rather than fail the whole batch on the unique index.
    await prisma.$transaction([
      ...body.pages.map((page) =>
        prisma.bookPage.upsert({
          where: { fileId_page: { fileId: id, page: page.page } },
          create: { fileId: id, page: page.page, text: page.text, source: page.source },
          update: { text: page.text, source: page.source },
        }),
      ),
      ...(body.finished
        ? [prisma.fileAsset.update({ where: { id }, data: { textIndexedAt: new Date() } })]
        : []),
    ]);

    if (body.finished) {
      await logAudit(user.email, "read-book-text", "file", id, file.title);
    }
    return NextResponse.json({ stored: body.pages.length });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Throws the whole reading away, for a book worth reading again from scratch. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const file = await bookFor(id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    const { count } = await prisma.bookPage.deleteMany({ where: { fileId: id } });
    await prisma.fileAsset.update({ where: { id }, data: { textIndexedAt: null } });
    await logAudit(user.email, "clear-book-text", "file", id, `${file.title}: ${count} pages`);
    return NextResponse.json({ cleared: count });
  } catch (error) {
    return errorResponse(error);
  }
}
