import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { getAnalyticsSummary } from "@/lib/content";
import { toCsv } from "@/lib/csv";

/** Exports the top series, videos and hymns for a given window as CSV or JSON. */
export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "view_analytics");
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days")) || 30;
    const format = searchParams.get("format") === "csv" ? "csv" : "json";

    const { totalViews, topSeries, topVideos, topHymns } = await getAnalyticsSummary(days);
    const rows = [
      ...topSeries.map((r) => ({ type: "series", title: r.series.title, views: r.views, watchThroughRate: "" })),
      ...topVideos.map((r) => ({
        type: "video",
        title: r.video.title,
        views: r.views,
        watchThroughRate: r.completionRate != null ? Math.round(r.completionRate * 100) : "",
      })),
      // Openings, not views — the same column because it is the same
      // question ("what gets used"), asked of a third kind of thing.
      ...topHymns.map((r) => ({
        type: "hymn",
        title: r.book ? `${r.title} — ${r.book}` : r.title,
        views: r.lookups,
        watchThroughRate: "",
      })),
    ];

    if (format === "csv") {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="analytics-${days}d.csv"`,
        },
      });
    }

    return NextResponse.json({ days, totalViews, rows });
  } catch (error) {
    return errorResponse(error);
  }
}
