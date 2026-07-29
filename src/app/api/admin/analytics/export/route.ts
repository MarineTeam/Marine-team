import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { getAnalyticsSummary } from "@/lib/content";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

/** Exports the top-series/top-videos analytics for a given window as CSV or JSON. */
export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "view_analytics");
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days")) || 30;
    const format = searchParams.get("format") === "csv" ? "csv" : "json";

    const { totalViews, topSeries, topVideos } = await getAnalyticsSummary(days);
    const rows = [
      ...topSeries.map((r) => ({ type: "series", title: r.series.title, views: r.views, watchThroughRate: "" })),
      ...topVideos.map((r) => ({
        type: "video",
        title: r.video.title,
        views: r.views,
        watchThroughRate: r.completionRate != null ? Math.round(r.completionRate * 100) : "",
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
