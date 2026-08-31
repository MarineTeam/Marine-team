import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * The words of one hymn inside a whole-book hymnal.
 *
 * A hymn that is its own file keeps its lyrics on its row; a hymn inside a
 * six-hundred-page PDF has no row of its own to keep anything on, which is
 * why a service built from book numbers could never be projected. These are
 * stored against the book and the number on the board — see BookHymnLyric
 * for why not against the contents row, which a reindex replaces.
 */
const schema = z.object({
  number: z.number().int().min(1).max(9999),
  // Empty is how a wrong set of words is removed: the row goes rather than
  // being kept as a blank that reads, to whatever asks, as "has lyrics".
  lyricsText: z.string().max(20000),
});

async function bookFor(id: string) {
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, title: true, seriesId: true, categoryId: true },
  });
  return file;
}

/**
 * With `?number=`, the words of that one hymn; without, the book's numbered
 * hymns and which of them have any.
 *
 * Two answers from one route because they are two views of the same thing,
 * and the list deliberately doesn't carry the words themselves: a hymnal
 * whose hymns have all been typed would be a megabyte of text to open a
 * picker with.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const file = await bookFor(id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    const wanted = request.nextUrl.searchParams.get("number");
    if (wanted !== null) {
      const number = z.coerce.number().int().min(1).parse(wanted);
      const row = await prisma.bookHymnLyric.findUnique({
        where: { fileId_number: { fileId: id, number } },
        select: { lyricsText: true },
      });
      return NextResponse.json({ lyricsText: row?.lyricsText ?? "" });
    }

    const [hymns, lyrics] = await Promise.all([
      prisma.bookHymn.findMany({
        where: { fileId: id, number: { not: null } },
        select: { title: true, number: true, page: true },
        orderBy: [{ number: "asc" }],
      }),
      prisma.bookHymnLyric.findMany({
        where: { fileId: id },
        select: { number: true, lyricsText: true },
      }),
    ]);

    const words = new Map(lyrics.map((row) => [row.number, row.lyricsText]));
    return NextResponse.json({
      hymns: hymns.map((hymn) => ({
        number: hymn.number,
        title: hymn.title,
        page: hymn.page,
        hasLyrics: words.has(hymn.number as number),
      })),
      // Words stored under a number the contents no longer list — a book
      // retyped or re-scanned since. Reported rather than hidden, so an
      // evening's typing can't quietly detach from the book it was for.
      orphaned: lyrics
        .filter((row) => !hymns.some((hymn) => hymn.number === row.number))
        .map((row) => row.number),
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

    const file = await bookFor(id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });

    const lyricsText = body.lyricsText.trim();
    if (lyricsText) {
      await prisma.bookHymnLyric.upsert({
        where: { fileId_number: { fileId: id, number: body.number } },
        create: { fileId: id, number: body.number, lyricsText },
        update: { lyricsText },
      });
    } else {
      await prisma.bookHymnLyric.deleteMany({ where: { fileId: id, number: body.number } });
    }

    await logAudit(
      user.email,
      lyricsText ? "edit-hymn-lyrics" : "clear-hymn-lyrics",
      "file",
      id,
      `${file.title}: hymn ${body.number}`,
    );
    return NextResponse.json({ ok: true, hasLyrics: Boolean(lyricsText) });
  } catch (error) {
    return errorResponse(error);
  }
}
