import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewSeries, publishedNow } from "@/lib/content";
import { isPluginEnabled } from "@/lib/plugins";
import { hymnReadingOrder } from "@/lib/hymnal";

/**
 * Everything needed to read a hymn-per-file book with no connection: its
 * hymns, in the order the book prints them, with their lyrics.
 *
 * A book like this has no single file to save — it *is* a series, and each
 * hymn is a row (see lib/hymnal.ts) — so the offline copy is this document,
 * stored in Cache Storage by the browser and rendered by the offline shell.
 * That makes this route the one place where a member's whole hymnal leaves
 * the server in one response, which is why the checks below are the same ones
 * the series page itself applies, in the same order:
 *
 * 1. the series exists, is published, and is a hymn-per-file book;
 * 2. this viewer may view it (share links and per-viewer grants included);
 * 3. saving to a device is switched on for that section.
 *
 * Hymns with no lyrics text are left out. Offline they would be blank pages —
 * the PDF behind them isn't saved — and the count returned here is what the
 * button reports, so nobody is told they have 420 hymns when 8 of them are
 * empty.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  try {
    const { seriesId } = await params;
    // The same gate every public listing applies, so a series that is
    // unpublished, scheduled, expired or trashed can't be saved by URL either.
    const published = publishedNow();

    const [user, series] = await Promise.all([
      getCurrentUser(),
      prisma.series.findFirst({
        where: { id: seriesId, hymnPerFile: true, ...published },
        select: {
          id: true,
          title: true,
          memberOnly: true,
          categoryId: true,
          files: {
            where: published,
            orderBy: [{ position: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              title: true,
              pageNumber: true,
              groupLabel: true,
              lyricsText: true,
              memberOnly: true,
            },
          },
        },
      }),
    ]);
    if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canViewSeries(user, series))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // The same switch that decides whether a video may be downloaded, scoped
    // to this section — saving a book to a device is the same permission.
    if (!(await isPluginEnabled("downloads", series.categoryId))) {
      return NextResponse.json(
        { error: "Saving for offline is turned off for this section." },
        { status: 409 },
      );
    }

    // A member-only hymn inside a series a signed-out visitor can otherwise
    // see is filtered here rather than in the query, which the series page
    // does too: the listing shows it, the content doesn't leave.
    const readable = series.files.filter((file) => Boolean(user) || !file.memberOnly);
    const hymns = hymnReadingOrder(readable)
      .filter((file) => file.lyricsText?.trim())
      .map((file) => ({
        id: file.id,
        title: file.title,
        pageNumber: file.pageNumber,
        groupLabel: file.groupLabel,
        lyricsText: file.lyricsText as string,
      }));

    return NextResponse.json(
      { seriesId: series.id, title: series.title, hymns },
      // Per viewer and only ever fetched deliberately; there is nothing here
      // for a shared cache to hold.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
