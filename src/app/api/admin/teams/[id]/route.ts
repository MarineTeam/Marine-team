import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/** Renames a team, or changes who is on it. */
const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  /** Adds somebody to the team; `position` is what they usually do. */
  addUserId: z.string().min(1).max(60).optional(),
  position: z.string().max(80).optional(),
  /** Removes somebody. Their past assignments stay — see ServiceTeamMember. */
  removeUserId: z.string().min(1).max(60).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const { id } = await params;
    const body = schema.parse(await request.json());

    const team = await prisma.serviceTeam.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.name) {
      await prisma.serviceTeam.update({ where: { id }, data: { name: body.name.trim() } });
    }
    if (body.addUserId) {
      await prisma.serviceTeamMember.upsert({
        where: { teamId_userId: { teamId: id, userId: body.addUserId } },
        create: { teamId: id, userId: body.addUserId, position: body.position?.trim() || null },
        update: { position: body.position?.trim() || null },
      });
    }
    if (body.removeUserId) {
      await prisma.serviceTeamMember.deleteMany({ where: { teamId: id, userId: body.removeUserId } });
    }

    await logAudit(user.email, "edit-team", "team", id, team.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const { id } = await params;

    const team = await prisma.serviceTeam.findUnique({
      where: { id },
      select: { name: true, _count: { select: { roles: true } } },
    });
    if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Deleting a team would take every rota it appears on with it, which is
    // a record of who served rather than a setting.
    if (team._count.roles > 0) {
      return NextResponse.json(
        { error: "This team is on a service rota. Take it off those services first." },
        { status: 409 },
      );
    }

    await prisma.serviceTeam.delete({ where: { id } });
    await logAudit(user.email, "delete-team", "team", id, team.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
