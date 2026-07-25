import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

/** Exports the full audit log as CSV or JSON for offline/compliance review. */
export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });

    if (format === "csv") {
      const csv = toCsv(entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-log.csv"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(entries, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="audit-log.json"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
