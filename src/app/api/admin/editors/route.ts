import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

export async function GET() {
  try {
    await ensureAdmin();
    const [categoryEditors, seriesEditors] = await Promise.all([
      prisma.categoryEditor.findMany({
        include: { user: true, category: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.seriesEditor.findMany({
        include: { user: true, series: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return NextResponse.json({ categoryEditors, seriesEditors });
  } catch (error) {
    return errorResponse(error);
  }
}
