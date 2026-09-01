import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { notifySubscribers } from "@/lib/push";
import { personName } from "@/lib/rota";

/**
 * Asking somebody to serve at a service, and un-asking them.
 *
 * The ask is a notification, not a row somebody might notice: being on a rota
 * is a commitment, and the whole difference between this and a note in the
 * plan is that the person is told and answers. It goes out on the same three
 * channels as everything else (push, email if opted in, and the profile
 * inbox, which is the copy that works whatever they allowed).
 */
const schema = z.object({
  planId: z.string().min(1).max(60),
  teamId: z.string().min(1).max(60),
  userId: z.string().min(1).max(60),
  position: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const body = schema.parse(await request.json());

    const [plan, team, person] = await Promise.all([
      prisma.servicePlan.findUnique({
        where: { id: body.planId },
        select: { id: true, title: true, serviceDate: true },
      }),
      prisma.serviceTeam.findUnique({ where: { id: body.teamId }, select: { id: true, name: true } }),
      prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, name: true, displayName: true, email: true },
      }),
    ]);
    if (!plan || !team || !person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const position = body.position?.trim() ?? "";
    const existing = await prisma.serviceAssignment.findUnique({
      where: { planId_userId_position: { planId: plan.id, userId: person.id, position } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "They're already asked for that." }, { status: 409 });
    }

    const assignment = await prisma.serviceAssignment.create({
      data: { planId: plan.id, teamId: team.id, userId: person.id, position },
    });

    const day = plan.serviceDate
      ? plan.serviceDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
      : plan.title;
    await notifySubscribers(
      {
        title: `You're on for ${day}`,
        body: `${position || team.name} — ${plan.title}. Let us know if you can make it.`,
        url: "/profile/rota",
      },
      [person.id],
    );

    await logAudit(
      user.email,
      "assign-volunteer",
      "plan",
      plan.id,
      `${personName(person)} — ${position || team.name}`,
    );
    return NextResponse.json({ assignment });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Takes somebody off a service. Deliberately silent: being un-asked isn't news to push at a phone. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which assignment?" }, { status: 400 });

    const assignment = await prisma.serviceAssignment.findUnique({
      where: { id },
      select: { planId: true, user: { select: { name: true, displayName: true, email: true } } },
    });
    if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.serviceAssignment.delete({ where: { id } });
    await logAudit(user.email, "unassign-volunteer", "plan", assignment.planId, personName(assignment.user));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
