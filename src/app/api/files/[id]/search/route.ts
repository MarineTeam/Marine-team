import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile, searchBookText } from "@/lib/content";

/**
 * Searching inside a book, from the text an admin read out of it.
 *
 * The reader can already search a book it has open — it walks the text layer
 * page by page. That is exact for a typeset PDF and useless for a scan,
 * which has no text layer, and slow on a long book either way: six hundred
 * pages parsed in the browser for every query.
 *
 * Where the pages have been read (see BookPage), this answers instead: one
 * query, and it works on a photograph. Where they haven't, it says so and
 * the reader falls back to what it has always done, rather than reporting
 * "no matches" for a book nobody has read yet — a silent wrong answer being
 * much worse than a slow right one.
 *
 * Same access check as reading the bytes: this shows nothing a visitor
 * couldn't already page through.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    const [user, file] = await Promise.all([getCurrentUser(), getReadableFile(id)]);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!file.textIndexedAt) return NextResponse.json({ indexed: false, hits: [] });
    if (query.length < 2) return NextResponse.json({ indexed: true, hits: [] });

    const hits = await searchBookText(id, query, file.pageOffset);
    return NextResponse.json(
      { indexed: true, hits },
      // A member's own search terms, and a book they may be the only one who
      // can open: never a shared cache's business.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
