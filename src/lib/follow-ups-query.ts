import { Prisma, type FollowUpSource, type FollowUpStatus, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { addIsoDays, fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { quietlyMissing } from "@/lib/attendance";
import {
  canAct,
  closeWith,
  countQueue,
  defaultDueDays,
  inWorkingOrder,
  newPrompts,
  titleFor,
  visibleFollowUps,
  type FollowUpRow,
  type FollowUpViewer,
  type Prompt,
} from "@/lib/follow-ups";

/**
 * The follow-up queue.
 *
 * The rules are in `follow-ups.ts`. What this file adds is the sweep: the
 * thing that turns what the app already knew — a card was filled in, somebody
 * came for the first time, a group's roll says somebody stopped coming — into
 * a job with a name and a date. It is idempotent by (source, reference), which
 * the unique index enforces, because a sweep that raises the same card every
 * night is a queue people learn to ignore.
 */

const select = {
  id: true,
  title: true,
  note: true,
  status: true,
  source: true,
  sourceRef: true,
  dueOn: true,
  outcome: true,
  completedAt: true,
  assignedToId: true,
  personId: true,
  householdId: true,
  createdAt: true,
  person: { select: { id: true, displayName: true } },
  assignedTo: { select: { id: true, email: true, displayName: true, name: true } },
} as const;

type Row = Prisma.FollowUpGetPayload<{ select: typeof select }>;

function asRow(row: Row) {
  return { ...row, dueOn: toIsoDate(row.dueOn), createdAt: row.createdAt.toISOString() };
}

export async function followUpViewer(user: User | null): Promise<FollowUpViewer> {
  return {
    userId: user?.id ?? null,
    manages: user ? await hasCapability(user, "manage_people") : false,
  };
}

/**
 * The queue this viewer may see, in the order it should be worked.
 *
 * Filtered before it is sorted, so a list handed to somebody who is not the
 * office is only ever theirs — it never contains rows a page could count.
 */
export async function listFollowUps(viewer: FollowUpViewer, includeClosed = false) {
  if (viewer.userId === null) return { followUps: [], counts: countQueue([], todayIso()) };

  const rows = await prisma.followUp.findMany({
    where: {
      ...(includeClosed ? {} : { status: "OPEN" as FollowUpStatus }),
      ...(viewer.manages ? {} : { assignedToId: viewer.userId }),
    },
    select,
    take: 300,
  });

  const today = todayIso();
  const shaped = rows.map(asRow);
  const visible = visibleFollowUps(shaped as unknown as FollowUpRow[], viewer);
  const byId = new Map(shaped.map((row) => [row.id, row]));

  return {
    followUps: inWorkingOrder(visible, today).map((row) => byId.get(row.id)!),
    counts: countQueue(visible, today),
  };
}

export async function createFollowUp(input: {
  title: string;
  note?: string | null;
  personId?: string | null;
  assignedToId?: string | null;
  dueOn?: IsoDate;
  source?: FollowUpSource;
  sourceRef?: string | null;
  byEmail: string;
}) {
  const title = input.title.trim();
  if (!title) throw new ApiError(400, "no_title", "Say what needs doing.");

  const household = input.personId
    ? (await prisma.person.findUnique({ where: { id: input.personId }, select: { householdId: true } }))?.householdId
    : null;

  return prisma.followUp.create({
    data: {
      title,
      note: input.note?.trim() || null,
      personId: input.personId ?? null,
      householdId: household ?? null,
      assignedToId: input.assignedToId ?? null,
      // A follow-up with no date is a follow-up that doesn't happen.
      dueOn: fromIsoDate(input.dueOn ?? addIsoDays(todayIso(), defaultDueDays(input.source ?? "MANUAL"))),
      source: input.source ?? "MANUAL",
      sourceRef: input.sourceRef ?? null,
      createdByEmail: input.byEmail,
    },
    select,
  });
}

async function load(id: string, viewer: FollowUpViewer) {
  const row = await prisma.followUp.findUnique({ where: { id }, select });
  // 404 rather than 403 either way: a follow-up names somebody, and whether
  // one exists is not something to confirm to whoever may not read it.
  if (!row || !canAct(asRow(row) as unknown as FollowUpRow, viewer)) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return row;
}

/** Picks one up, hands it on, or puts it back. */
export async function assignFollowUp(id: string, assignedToId: string | null, viewer: FollowUpViewer) {
  await load(id, viewer);
  return prisma.followUp.update({ where: { id }, data: { assignedToId }, select });
}

/** Closes one, with what came of it. */
export async function closeFollowUp(
  id: string,
  status: FollowUpStatus,
  outcome: string | undefined,
  viewer: FollowUpViewer,
) {
  await load(id, viewer);
  const decision = closeWith(status, outcome);
  if (!decision.ok) throw new ApiError(400, "needs_outcome", decision.reason);

  return prisma.followUp.update({
    where: { id },
    data: { status: decision.status, outcome: decision.outcome, completedAt: new Date() },
    select,
  });
}

/** Reopens one that was closed too soon. */
export async function reopenFollowUp(id: string, viewer: FollowUpViewer) {
  await load(id, viewer);
  return prisma.followUp.update({
    where: { id },
    data: { status: "OPEN", completedAt: null },
    select,
  });
}

/**
 * Everything the app already knows that somebody should act on.
 *
 * Three sources, each already computed elsewhere — this only turns them into
 * jobs. Nothing here decides *who* should do it: an unassigned card is a state
 * worth seeing, and guessing an owner is how a queue becomes one person's
 * problem and then nobody's.
 */
export async function gatherPrompts(since: Date): Promise<Prompt[]> {
  const prompts: Prompt[] = [];

  const submissions = await prisma.formSubmission.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, createdAt: true, form: { select: { title: true } } },
    take: 200,
  });
  for (const submission of submissions) {
    prompts.push({
      source: "FORM",
      sourceRef: submission.id,
      title: titleFor("FORM", submission.form.title),
      personId: null,
      note: null,
    });
  }

  const firstTimers = await prisma.eventRegistration.findMany({
    where: { createdAt: { gte: since }, status: "GOING" },
    select: { id: true, name: true, userId: true, event: { select: { title: true } } },
    take: 200,
  });
  for (const registration of firstTimers) {
    const earlier = registration.userId
      ? await prisma.eventRegistration.count({
          where: { userId: registration.userId, id: { not: registration.id } },
        })
      : 0;
    // Only the first one: somebody signing up for their fourth thing does not
    // need a welcome call, and a queue full of those is a queue nobody reads.
    if (earlier > 0) continue;
    prompts.push({
      source: "EVENT",
      sourceRef: registration.id,
      title: titleFor("EVENT", registration.name),
      personId: null,
      note: registration.event.title,
    });
  }

  const groups = await prisma.smallGroup.findMany({
    select: {
      id: true,
      name: true,
      members: { where: { status: "ACTIVE" }, select: { userId: true, user: { select: { person: { select: { id: true, displayName: true } } } } } },
      smallGroupMeetings: {
        orderBy: { date: "desc" },
        take: 6,
        select: { id: true, date: true, cancelled: true, visitorCount: true, attendance: { select: { userId: true, status: true, note: true } } },
      },
    },
  });
  for (const group of groups) {
    const missing = quietlyMissing(
      group.smallGroupMeetings.map((meeting) => ({ ...meeting, date: toIsoDate(meeting.date) })),
      group.members.map((member) => member.userId),
    );
    for (const userId of missing) {
      const person = group.members.find((member) => member.userId === userId)?.user?.person;
      if (!person) continue;
      prompts.push({
        source: "GROUP_ABSENCE",
        // The group, not the meeting: somebody who has stopped coming should
        // raise one job, not a new one after every meeting they miss.
        sourceRef: `${group.id}:${person.id}`,
        title: titleFor("GROUP_ABSENCE", person.displayName),
        personId: person.id,
        note: group.name,
      });
    }
  }

  return prompts;
}

/** Raises a card for every prompt that hasn't got one. Safe to run nightly. */
export async function sweep(since: Date, byEmail = "sweep"): Promise<{ raised: number }> {
  const prompts = await gatherPrompts(since);
  if (prompts.length === 0) return { raised: 0 };

  const existing = await prisma.followUp.findMany({
    where: { sourceRef: { in: prompts.map((prompt) => prompt.sourceRef) } },
    select: { source: true, sourceRef: true },
  });

  let raised = 0;
  for (const prompt of newPrompts(prompts, existing)) {
    try {
      await createFollowUp({
        title: prompt.title,
        note: prompt.note,
        personId: prompt.personId,
        source: prompt.source,
        sourceRef: prompt.sourceRef,
        byEmail,
      });
      raised += 1;
    } catch (error) {
      // Two sweeps overlapping: the unique index decides and the loser moves
      // on, rather than failing a job that is most of the way through.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { raised };
}

/** The office, or whoever holds something in the queue. */
export async function requireQueueAccess(): Promise<{ user: User; viewer: FollowUpViewer }> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(404, "not_found", "Not found");
  return { user, viewer: await followUpViewer(user) };
}
