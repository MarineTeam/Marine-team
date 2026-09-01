import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextGroupSlug } from "@/lib/groups-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const groups = await prisma.smallGroup.findMany({
      orderBy: { name: "asc" },
      include: { members: { select: { status: true, role: true } } },
    });
    return NextResponse.json({
      groups: groups.map(({ members, ...group }) => ({
        ...group,
        memberCount: members.filter((member) => member.status === "ACTIVE").length,
        waiting: members.filter((member) => member.status === "REQUESTED").length,
        leaders: members.filter((member) => member.role === "LEADER" && member.status === "ACTIVE").length,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { name } = createSchema.parse(await request.json());
    const group = await prisma.smallGroup.create({
      data: { name, slug: await nextGroupSlug(name) },
    });
    await logAudit(user.email, "create", "small-group", group.id, group.name);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
