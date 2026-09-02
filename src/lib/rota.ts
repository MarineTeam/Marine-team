import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * Who is serving at a service, and whether they have said yes.
 *
 * A rota is not a list of names: it is a list of *asks*, each of which is
 * outstanding, accepted or declined. That distinction is the entire reason
 * this exists rather than a note in the plan, so it is the thing every view
 * here leads with.
 */

/** A blockout covers whole days at both ends — "away the 3rd to the 5th" means all three. */
export function isBlockedOut(
  blockouts: { startDate: Date; endDate: Date }[],
  day: Date | null,
): boolean {
  if (!day) return false;
  const at = day.getTime();
  return blockouts.some((away) => at >= startOfDay(away.startDate) && at <= endOfDay(away.endDate));
}

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime();
}

function endOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy.getTime();
}

/** How to describe an assignment's job: its position, or the team it is on. */
export function assignmentRole(assignment: { position: string; team: { name: string } }): string {
  return assignment.position.trim() || assignment.team.name;
}

/** Everyone asked to serve at this plan, in team order. */
export const getPlanAssignments = cache(async function getPlanAssignments(planId: string) {
  return prisma.serviceAssignment.findMany({
    where: { planId },
    include: {
      team: { select: { id: true, name: true, position: true } },
      user: { select: { id: true, name: true, displayName: true, email: true } },
      coveredFor: { select: { name: true, displayName: true, email: true } },
    },
    orderBy: [{ team: { position: "asc" } }, { position: "asc" }],
  });
});

/**
 * What one member has been asked to do, soonest first.
 *
 * Undated plans sort last rather than being dropped: a plan without a day yet
 * is still an ask, and hiding it would be the app quietly forgetting to tell
 * somebody they are on.
 */
export const getMyAssignments = cache(async function getMyAssignments(userId: string) {
  const assignments = await prisma.serviceAssignment.findMany({
    where: {
      userId,
      // Everything upcoming, plus anything still unanswered whenever it was
      // for — an ask nobody replied to doesn't stop being unanswered because
      // the date went by.
      OR: [
        { plan: { serviceDate: { gte: startOfToday() } } },
        { plan: { serviceDate: null } },
        { status: "INVITED" },
      ],
    },
    include: {
      team: { select: { name: true } },
      plan: { select: { id: true, title: true, serviceDate: true, published: true } },
    },
    orderBy: [{ plan: { serviceDate: "asc" } }, { createdAt: "asc" }],
  });
  return assignments;
});

function startOfToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/** The teams, with who is on them — the picker a rota is built from. */
export const getTeams = cache(async function getTeams() {
  return prisma.serviceTeam.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      members: {
        include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
});

/** What to call somebody on a rota: their chosen name, then their account's, then their address. */
export function personName(user: {
  name: string | null;
  displayName: string | null;
  email: string;
}): string {
  return user.displayName?.trim() || user.name?.trim() || user.email;
}
