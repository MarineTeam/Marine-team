import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { notifySubscribers } from "@/lib/push";
import { assignmentRole } from "@/lib/rota";
import { canAskForCover, canTake, coverState, needsConfirming, takeMessage } from "@/lib/cover";

/**
 * Asking for cover, and taking it.
 *
 * The rules are in `cover.ts`. What this file is careful about is that a slot
 * changes hands **once**: two people pressing "I'll take it" in the same second
 * is not a rare case on a Sunday morning, and the loser has to be told they
 * lost rather than both being thanked.
 */

const withPlan = {
  team: { select: { name: true } },
  plan: { select: { id: true, title: true, serviceDate: true, published: true } },
} as const;

/** Puts a slot up for somebody else to take. */
export async function askForCover(assignmentId: string, userId: string, note: string | null) {
  const assignment = await prisma.serviceAssignment.findUnique({
    where: { id: assignmentId },
    include: withPlan,
  });
  if (!assignment) throw new ApiError(404, "not_found", "That's not on your rota.");

  const outcome = canAskForCover(assignment, userId);
  if (outcome !== "ok") {
    throw new ApiError(
      outcome === "not-yours" ? 403 : 400,
      outcome.replace(/-/g, "_"),
      {
        "not-yours": "That's not yours to hand on.",
        declined: "You've already said no to this one — there's nothing to cover.",
        "already-asking": "You've already asked for cover on this.",
        past: "That service has been and gone.",
        unpublished: "That service isn't published yet, so nobody else can see it.",
      }[outcome],
    );
  }

  const updated = await prisma.serviceAssignment.update({
    where: { id: assignmentId },
    data: { coverWanted: true, coverNote: note?.trim() || null, coverAskedAt: new Date() },
    include: withPlan,
  });

  await tellTheTeam(updated, userId);
  return updated;
}

/** Takes it back off the list — they sorted it out, or they can make it after all. */
export async function withdrawCover(assignmentId: string, userId: string): Promise<void> {
  const { count } = await prisma.serviceAssignment.updateMany({
    where: { id: assignmentId, userId, coverWanted: true },
    data: { coverWanted: false, coverNote: null, coverAskedAt: null },
  });
  if (count === 0) throw new ApiError(404, "not_found", "There's no open request on that one.");
}

/**
 * Hands the slot over.
 *
 * The write is a conditional `updateMany` matching on both `coverWanted` and
 * the person who currently holds it, so two people taking the same slot at once
 * produces one winner and one honest "somebody has already taken this" — rather
 * than a lost update where the second write silently wins and the first
 * volunteer is told they are on when they are not.
 */
export async function takeCover(assignmentId: string, takerId: string, confirmedAway = false) {
  const assignment = await prisma.serviceAssignment.findUnique({
    where: { id: assignmentId },
    include: withPlan,
  });
  if (!assignment) throw new ApiError(404, "not_found", "That's not there any more.");

  const [blockouts, alreadyOn] = await Promise.all([
    prisma.serviceBlockout.findMany({ where: { userId: takerId }, select: { startDate: true, endDate: true } }),
    prisma.serviceAssignment.count({ where: { planId: assignment.planId, userId: takerId } }),
  ]);

  const state = coverState(assignment, { id: takerId, blockouts }, alreadyOn > 0);
  if (!canTake(state)) throw new ApiError(state === "not-open" ? 409 : 400, state.replace(/-/g, "_"), takeMessage(state));
  if (needsConfirming(state) && !confirmedAway) {
    throw new ApiError(409, "confirm_away", takeMessage(state));
  }

  const previousUserId = assignment.userId;
  let count: number;
  try {
    ({ count } = await prisma.serviceAssignment.updateMany({
      where: { id: assignmentId, coverWanted: true, userId: previousUserId },
      data: {
        userId: takerId,
        coveredForId: previousUserId,
        coveredAt: new Date(),
        coverWanted: false,
        coverNote: null,
        coverAskedAt: null,
        status: "ACCEPTED",
        respondedAt: new Date(),
        // The old note was the previous person's reason for declining or their
        // aside to the organiser. Carrying it onto somebody else's acceptance
        // would put words in the new person's mouth.
        note: null,
      },
    }));
  } catch (error) {
    // The unique index on (plan, user, position) is the last word on somebody
    // being in two places. `alreadyOn` above should have caught it, so reaching
    // here means a race — answered as such rather than as a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "already_on", "You're already on for that service.");
    }
    throw error;
  }
  if (count === 0) throw new ApiError(409, "not_open", "Somebody has already taken this.");

  await notifySubscribers(
    {
      title: `${assignmentRole(assignment)} is covered`,
      body: `Somebody has taken your place at ${assignment.plan.title}.`,
      url: "/profile/rota",
    },
    [previousUserId],
  );

  return prisma.serviceAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: withPlan });
}

/**
 * Slots on this member's teams that somebody has asked to be covered.
 *
 * Scoped to the teams they are actually on, because a cover request is an ask
 * addressed to the people who could do the job — showing every open slot in the
 * building to everybody is how a list like this becomes wallpaper.
 */
export async function openCoverRequests(userId: string) {
  const teams = await prisma.serviceTeamMember.findMany({ where: { userId }, select: { teamId: true } });
  if (teams.length === 0) return [];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return prisma.serviceAssignment.findMany({
    where: {
      coverWanted: true,
      teamId: { in: teams.map((team) => team.teamId) },
      userId: { not: userId },
      plan: { published: true, OR: [{ serviceDate: { gte: today } }, { serviceDate: null }] },
    },
    include: { ...withPlan, user: { select: { name: true, displayName: true } } },
    orderBy: [{ plan: { serviceDate: "asc" } }, { coverAskedAt: "asc" }],
  });
}

/** Everybody else on the team, told once that a slot needs taking. */
async function tellTheTeam(
  assignment: { id: string; teamId: string; userId: string; team: { name: string }; position: string; plan: { title: string } },
  askerId: string,
): Promise<void> {
  const members = await prisma.serviceTeamMember.findMany({
    where: { teamId: assignment.teamId, userId: { not: askerId } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  await notifySubscribers(
    {
      title: `Cover needed: ${assignmentRole(assignment)}`,
      body: `${assignment.plan.title} — somebody on your team can't make it.`,
      url: "/profile/rota",
    },
    members.map((member) => member.userId),
  );
}
