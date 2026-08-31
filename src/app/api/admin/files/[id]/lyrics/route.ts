import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * What is known about one hymn inside a whole-book hymnal: its words, and
 * its credits.
 *
 * A hymn that is its own file keeps these on its row; a hymn inside a
 * six-hundred-page PDF has no row of its own, which is why a service built
 * from book numbers could never be projected and never appeared in a licence
 * return. They are stored against the book and the number on the board — see
 * BookHymnDetail for why not against the contents row, which a reindex
 * replaces.
 */
const schema = z.object({
  number: z.number().int().min(1).max(9999),
  // Empty is how a wrong set of words is removed: what is stored is a blank
  // rather than a row that reads, to whatever asks, as "has lyrics".
  lyricsText: z.string().max(20000),
  ccliNumber: z.string().max(60).optional(),
  author: z.string().max(300).optional(),
  copyright: z.string().max(300).optional(),
  musicalKey: z.string().max(12).optional(),
  // A blank box comes through as "", which is not a tempo and not an error.
  tempoBpm: z.union([z.coerce.number().int().min(20).max(400), z.literal("")]).optional(),
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
      const row = await prisma.bookHymnDetail.findUnique({
        where: { fileId_number: { fileId: id, number } },
        select: {
          lyricsText: true,
          ccliNumber: true,
          author: true,
          copyright: true,
          musicalKey: true,
          tempoBpm: true,
        },
      });
      return NextResponse.json({
        lyricsText: row?.lyricsText ?? "",
        ccliNumber: row?.ccliNumber ?? "",
        author: row?.author ?? "",
        copyright: row?.copyright ?? "",
        musicalKey: row?.musicalKey ?? "",
        tempoBpm: row?.tempoBpm ?? "",
      });
    }

    const [hymns, lyrics] = await Promise.all([
      prisma.bookHymn.findMany({
        where: { fileId: id, number: { not: null } },
        select: { title: true, number: true, page: true },
        orderBy: [{ number: "asc" }],
      }),
      prisma.bookHymnDetail.findMany({
        where: { fileId: id },
        select: { number: true, lyricsText: true, ccliNumber: true },
      }),
    ]);

    const detailed = new Map(lyrics.map((row) => [row.number, row]));
    return NextResponse.json({
      hymns: hymns.map((hymn) => {
        const detail = detailed.get(hymn.number as number);
        return {
          number: hymn.number,
          title: hymn.title,
          page: hymn.page,
          hasLyrics: Boolean(detail?.lyricsText),
          hasCredits: Boolean(detail?.ccliNumber),
        };
      }),
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

    const text = (value: string | undefined) => value?.trim() || null;
    const lyricsText = text(body.lyricsText);
    const fields = {
      lyricsText,
      ccliNumber: text(body.ccliNumber),
      author: text(body.author),
      copyright: text(body.copyright),
      musicalKey: text(body.musicalKey),
      tempoBpm: typeof body.tempoBpm === "number" ? body.tempoBpm : null,
    };

    // A row with every field empty says nothing; it goes rather than sitting
    // there as a hymn somebody has "filled in".
    if (Object.values(fields).every((value) => value === null)) {
      await prisma.bookHymnDetail.deleteMany({ where: { fileId: id, number: body.number } });
      await logAudit(user.email, "clear-hymn-detail", "file", id, `${file.title}: hymn ${body.number}`);
      return NextResponse.json({ ok: true, hasLyrics: false, hasCredits: false });
    }

    await prisma.bookHymnDetail.upsert({
      where: { fileId_number: { fileId: id, number: body.number } },
      create: { fileId: id, number: body.number, ...fields },
      update: fields,
    });

    await logAudit(user.email, "edit-hymn-detail", "file", id, `${file.title}: hymn ${body.number}`);
    return NextResponse.json({
      ok: true,
      hasLyrics: Boolean(lyricsText),
      hasCredits: Boolean(fields.ccliNumber),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
