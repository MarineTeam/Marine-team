import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const grant = await prisma.seriesViewerGroup.findUniqueOrThrow({
      where: { id },
      include: { series: true, group: true },
    });
    await ensureSeriesAccess(user, grant.series);
    await prisma.seriesViewerGroup.delete({ where: { id } });
    await logAudit(user.email, "revoke_series_viewer_group", "series", grant.seriesId, grant.group.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
