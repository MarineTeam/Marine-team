import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const grant = await prisma.seriesViewer.findUniqueOrThrow({
      where: { id },
      include: { series: true, user: true },
    });
    await ensureSeriesAccess(user, grant.series);
    await prisma.seriesViewer.delete({ where: { id } });
    await logAudit(user.email, "revoke_series_viewer", "series", grant.seriesId, grant.user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
