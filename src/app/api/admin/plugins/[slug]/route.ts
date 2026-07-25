import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { slug } = await params;
    const { enabled } = schema.parse(await request.json());
    const plugin = await prisma.plugin.update({ where: { slug }, data: { enabled } });
    await logAudit(user.email, enabled ? "activate_plugin" : "deactivate_plugin", "plugin", plugin.id, plugin.name);
    return NextResponse.json(plugin);
  } catch (error) {
    return errorResponse(error);
  }
}
