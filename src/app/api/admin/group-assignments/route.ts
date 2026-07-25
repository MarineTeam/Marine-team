import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  userEmail: z.string().email(),
  groupId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  seriesId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const assignments = await prisma.groupAssignment.findMany({
      orderBy: { createdAt: "asc" },
      include: { user: true, group: true, category: true, series: true },
    });
    return NextResponse.json(assignments);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_permissions");
    const body = schema.parse(await request.json());
    if (body.categoryId && body.seriesId) {
      return NextResponse.json(
        { error: "Scope to either a category or a series, not both" },
        { status: 400 },
      );
    }
    const targetUser = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
    if (!targetUser) {
      return NextResponse.json({ error: "No user with that email has logged in yet" }, { status: 404 });
    }
    const assignment = await prisma.groupAssignment.create({
      data: {
        userId: targetUser.id,
        groupId: body.groupId,
        categoryId: body.categoryId || null,
        seriesId: body.seriesId || null,
      },
      include: { user: true, group: true, category: true, series: true },
    });
    await logAudit(
      user.email,
      "assign_group",
      "group_assignment",
      assignment.id,
      `${targetUser.email} → ${assignment.group.name}`,
    );
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
