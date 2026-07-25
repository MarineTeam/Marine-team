import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { CAPABILITY_KEYS } from "@/lib/capabilities";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.enum(CAPABILITY_KEYS as [string, ...string[]])),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const groups = await prisma.permissionGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    });
    return NextResponse.json(groups);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const body = schema.parse(await request.json());
    const group = await prisma.permissionGroup.create({ data: body });
    await logAudit(user.email, "create", "permission_group", group.id, group.name);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
