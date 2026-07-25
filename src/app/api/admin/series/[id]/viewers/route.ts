import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ userEmail: z.string().email() });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, series);
    const viewers = await prisma.seriesViewer.findMany({ where: { seriesId: id }, include: { user: true } });
    return NextResponse.json(viewers);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Grants a specific user viewing access to a restricted series. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, series);
    const { userEmail } = schema.parse(await request.json());
    const target = await prisma.user.findUnique({ where: { email: userEmail.toLowerCase() } });
    if (!target) {
      return NextResponse.json({ error: "No user with that email has logged in yet" }, { status: 404 });
    }
    const grant = await prisma.seriesViewer.create({
      data: { seriesId: id, userId: target.id },
      include: { user: true },
    });
    await logAudit(user.email, "grant_series_viewer", "series", id, target.email);
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
