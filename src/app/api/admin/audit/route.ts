import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

export async function GET() {
  try {
    await ensureAdmin();
    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
}
