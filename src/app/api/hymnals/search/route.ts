import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { searchHymnsInCategory } from "@/lib/content";

/**
 * Hymns inside one section's books, by name or number.
 *
 * A route rather than a `?q=` on the category page because this answers as
 * somebody types: a hymnal is looked up mid-sentence ("it's the one about the
 * river…"), and a page reload per keystroke is not that.
 *
 * Answers for whoever is asking: `searchHymnsInCategory` applies the same
 * published/members-only rules as every listing, so this can't surface a hymn
 * from a book the visitor couldn't open.
 */
export async function GET(request: NextRequest) {
  try {
    const categoryId = request.nextUrl.searchParams.get("category");
    const query = request.nextUrl.searchParams.get("q") ?? "";
    if (!categoryId) return NextResponse.json({ error: "Missing category" }, { status: 400 });

    const user = await getCurrentUser();
    const hymns = await searchHymnsInCategory(categoryId, query, Boolean(user));
    return NextResponse.json(
      { hymns },
      // Per viewer, and typed afresh each time; there is nothing here for a
      // shared cache to hold.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
