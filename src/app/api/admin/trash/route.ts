import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, hasCapability } from "@/lib/permissions";
import { getTrashedItems } from "@/lib/content";

/**
 * Trash spans four content types with four different capabilities
 * (manage_categories/series/videos/files), so — unlike a single-type admin
 * list — this requires holding at least one of them site-wide (or being
 * ADMIN) rather than trying to resolve a per-item scoped view across types.
 * A category/series-scoped editor won't see a personal trash view here.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    const [canCategories, canSeries, canVideos, canFiles] = await Promise.all([
      hasCapability(user, "manage_categories"),
      hasCapability(user, "manage_series"),
      hasCapability(user, "manage_videos"),
      hasCapability(user, "manage_files"),
    ]);
    if (!canCategories && !canSeries && !canVideos && !canFiles) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await getTrashedItems());
  } catch (error) {
    return errorResponse(error);
  }
}
