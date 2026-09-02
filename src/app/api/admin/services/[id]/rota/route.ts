import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { getPlanAssignments, isBlockedOut, personName } from "@/lib/rota";

/**
 * Who is on for one service, with each answer and whether they had already
 * said they were away that day.
 *
 * The away check is done here rather than in the browser because it needs
 * everybody's blockouts, which are nobody else's business to hold.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const { id } = await params;

    const plan = await prisma.servicePlan.findUnique({
      where: { id },
      select: { id: true, serviceDate: true },
    });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const assignments = await getPlanAssignments(plan.id);
    const blockouts = assignments.length
      ? await prisma.serviceBlockout.findMany({
          where: { userId: { in: assignments.map((row) => row.userId) } },
          select: { userId: true, startDate: true, endDate: true },
        })
      : [];

    return NextResponse.json({
      assignments: assignments.map((row) => ({
        id: row.id,
        teamId: row.teamId,
        userId: row.userId,
        position: row.position,
        status: row.status,
        note: row.note,
        personName: personName(row.user),
        teamName: row.team.name,
        // The organiser's two questions about a swap: is anybody still needed
        // for this, and who is actually turning up now.
        coverWanted: row.coverWanted,
        coverNote: row.coverNote,
        coveredFor: row.coveredFor ? personName(row.coveredFor) : null,
        away: isBlockedOut(
          blockouts.filter((away) => away.userId === row.userId),
          plan.serviceDate,
        ),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
