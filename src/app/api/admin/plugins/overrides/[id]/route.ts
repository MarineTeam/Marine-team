import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    await prisma.pluginCategoryOverride.delete({ where: { id } });
    await logAudit(user.email, "remove_plugin_override", "plugin_override", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
