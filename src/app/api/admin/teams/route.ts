import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * The teams that serve at a service, and who is on them.
 *
 * Gated on `manage_files` like the service plans themselves: whoever arranges
 * a service is who arranges the people at it.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");

    const [teams, members] = await Promise.all([
      prisma.serviceTeam.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          members: {
            include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
            orderBy: { joinedAt: "asc" },
          },
        },
      }),
      // Everybody who could be put on a team. Authorized accounts only: an
      // account that can't get in can't be asked to serve.
      prisma.user.findMany({
        where: { authorized: true },
        select: { id: true, name: true, displayName: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 500,
      }),
    ]);

    return NextResponse.json({ teams, people: members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const body = z.object({ name: z.string().min(1).max(80) }).parse(await request.json());

    const count = await prisma.serviceTeam.count();
    const team = await prisma.serviceTeam.create({
      data: { name: body.name.trim(), position: count },
    });
    await logAudit(user.email, "create-team", "team", team.id, team.name);
    return NextResponse.json({ team });
  } catch (error) {
    return errorResponse(error);
  }
}
