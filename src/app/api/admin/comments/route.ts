import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, getCapabilityScope, descendantCategoryIds } from "@/lib/permissions";
import { getReportedComments } from "@/lib/content";

/** Reported/hidden comments, scoped to the moderator's own categories/series unless they hold a site-wide moderate_comments grant. */
export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getCapabilityScope(user, "moderate_comments");
    if (!scope.isAdmin && scope.categoryIds.length === 0 && scope.seriesIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const comments = await getReportedComments(
      scope.isAdmin
        ? undefined
        : { categoryIds: await descendantCategoryIds(scope.categoryIds), seriesIds: scope.seriesIds },
    );
    return NextResponse.json(comments);
  } catch (error) {
    return errorResponse(error);
  }
}
