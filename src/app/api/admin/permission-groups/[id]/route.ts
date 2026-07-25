import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { CAPABILITY_KEYS } from "@/lib/capabilities";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  capabilities: z.array(z.enum(CAPABILITY_KEYS as [string, ...string[]])).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const group = await prisma.permissionGroup.update({ where: { id }, data: body });
    await logAudit(user.email, "update", "permission_group", group.id, JSON.stringify(body));
    return NextResponse.json(group);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const { id } = await params;
    const group = await prisma.permissionGroup.delete({ where: { id } });
    await logAudit(user.email, "delete", "permission_group", id, group.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
