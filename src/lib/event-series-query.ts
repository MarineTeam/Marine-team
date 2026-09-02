import type { EventSeries, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, todayIso, toIsoDate, type IsoDate } from "@/lib/dates";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  datesToCreate,
  shapeOf,
  horizonEnd,
  planOccurrences,
  seriesProblems,
  stopSeriesPlan,
  type PlannedOccurrence,
  type SeriesShape,
} from "@/lib/event-series";

/**
 * Turning a repeating event into rows, and keeping them in step with the rule.
 *
 * The rules live in `event-series.ts`, where a test can drive them without a
 * database. This file is the part that writes, and the two things it is careful
 * about are both about not surprising anybody:
 *
 *  - **Generating twice must change nothing.** The unique index on
 *    (seriesId, occurrenceDate) is the backstop; `datesToCreate` is what makes
 *    it never fire.
 *  - **Editing a series never rewrites the past.** Occurrences that have
 *    already happened are the record of what happened, and a title changed in
 *    March should not relabel February's meeting.
 */

/** The template fields an occurrence is stamped from. */
function stampOf(series: EventSeries) {
  return {
    title: series.title,
    description: series.description,
    location: series.location,
    published: series.published,
    memberOnly: series.memberOnly,
    registration: series.registration,
    capacity: series.capacity,
    waitlist: series.waitlist,
    maxGuests: series.maxGuests,
    allDay: series.allDay,
  };
}

/**
 * `title-2026-01-06` rather than `title-2`, `title-3`.
 *
 * A URL somebody pastes into a newsletter should say which week it is for. The
 * taken set is grown as it goes so one pass over a term's worth of dates
 * doesn't need a query each.
 */
function occurrenceSlug(title: string, date: IsoDate, taken: Set<string>): string {
  const slug = uniqueSlug(`${slugify(title) || "event"}-${date}`, taken, `event-${date}`);
  taken.add(slug);
  return slug;
}

function rowFor(series: EventSeries, occurrence: PlannedOccurrence, slug: string): Prisma.EventCreateManyInput {
  return {
    ...stampOf(series),
    slug,
    seriesId: series.id,
    occurrenceDate: fromIsoDate(occurrence.date),
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    opensAt: occurrence.opensAt,
    closesAt: occurrence.closesAt,
  };
}

/**
 * Creates the occurrences this series is missing, out to the horizon.
 *
 * Safe to call as often as you like: it asks what exists, subtracts what an
 * organiser removed, and writes the difference. `skipDuplicates` is belt to the
 * unique index's braces — two of these racing (a cron and an admin pressing
 * save) should produce one diary, not an error.
 */
export async function generateOccurrences(seriesId: string, today: IsoDate = todayIso()): Promise<number> {
  const series = await prisma.eventSeries.findUnique({ where: { id: seriesId } });
  if (!series) throw new ApiError(404, "not_found", "That series no longer exists.");

  const shape = shapeOf(series);
  const problems = seriesProblems(shape);
  if (problems.length > 0) throw new ApiError(400, "invalid_series", problems[0]);

  // From the series' own start rather than from today, so a series set up with
  // dates already in the past still creates them — an organiser entering last
  // month's meetings expects to see them.
  const until = horizonEnd(today);
  const planned = planOccurrences(shape, shape.startDate, until);

  const [existing, taken] = await Promise.all([
    prisma.event.findMany({ where: { seriesId }, select: { occurrenceDate: true } }),
    prisma.event.findMany({ select: { slug: true } }),
  ]);

  const slugs = new Set(taken.map((event) => event.slug));
  const todo = datesToCreate(
    planned,
    existing.flatMap((event) => (event.occurrenceDate ? [toIsoDate(event.occurrenceDate)] : [])),
    series.excludedDates.map(toIsoDate),
  );

  if (todo.length > 0) {
    await prisma.event.createMany({
      data: todo.map((occurrence) => rowFor(series, occurrence, occurrenceSlug(series.title, occurrence.date, slugs))),
      skipDuplicates: true,
    });
  }

  await prisma.eventSeries.update({ where: { id: seriesId }, data: { generatedThrough: fromIsoDate(until) } });
  return todo.length;
}

export type SeriesInput = SeriesShape & {
  title: string;
  description?: string | null;
  location?: string | null;
  published?: boolean;
  memberOnly?: boolean;
  registration?: boolean;
  capacity?: number | null;
  waitlist?: boolean;
  maxGuests?: number;
};

export async function createSeries(input: SeriesInput, today: IsoDate = todayIso()) {
  const problems = seriesProblems(input);
  if (problems.length > 0) throw new ApiError(400, "invalid_series", problems[0]);

  const series = await prisma.eventSeries.create({
    data: {
      rule: input.rule,
      timeZone: input.timeZone,
      startDate: fromIsoDate(input.startDate),
      startTime: input.allDay ? null : input.startTime,
      durationMinutes: input.durationMinutes,
      allDay: input.allDay,
      opensDaysBefore: input.opensDaysBefore,
      closesDaysBefore: input.closesDaysBefore,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      published: input.published ?? false,
      memberOnly: input.memberOnly ?? false,
      registration: input.registration ?? false,
      capacity: input.capacity ?? null,
      waitlist: input.waitlist ?? true,
      maxGuests: input.maxGuests ?? 0,
    },
  });
  const created = await generateOccurrences(series.id, today);
  return { series, created };
}

/**
 * Changes the series, then brings the dates still to come into line with it.
 *
 * Occurrences already past are left exactly as they were. That is not laziness:
 * they are what happened, and a title corrected in March relabelling February's
 * meeting would make the diary a worse record than a paper one.
 *
 * When the *timing* changes — the rule, the time of day, the zone, the length —
 * future occurrences that nobody has signed up for are cleared out and made
 * again from the new rule. Ones with names on them are left exactly where they
 * are, because moving a meeting somebody has booked is a conversation, not a
 * database write. They stay listed under the series, stranded on their old
 * date, so the organiser can see the ones that didn't move and ring round.
 */
export async function updateSeries(
  seriesId: string,
  patch: Partial<SeriesInput>,
  today: IsoDate = todayIso(),
): Promise<{ series: EventSeries; created: number; moved: number; stranded: number }> {
  const before = await prisma.eventSeries.findUnique({ where: { id: seriesId } });
  if (!before) throw new ApiError(404, "not_found", "That series no longer exists.");

  const merged: SeriesShape = { ...shapeOf(before), ...patch };
  const problems = seriesProblems(merged);
  if (problems.length > 0) throw new ApiError(400, "invalid_series", problems[0]);

  const series = await prisma.eventSeries.update({
    where: { id: seriesId },
    data: {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
      ...(patch.startDate !== undefined ? { startDate: fromIsoDate(patch.startDate) } : {}),
      ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
      ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
      ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
      ...(patch.opensDaysBefore !== undefined ? { opensDaysBefore: patch.opensDaysBefore } : {}),
      ...(patch.closesDaysBefore !== undefined ? { closesDaysBefore: patch.closesDaysBefore } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.published !== undefined ? { published: patch.published } : {}),
      ...(patch.memberOnly !== undefined ? { memberOnly: patch.memberOnly } : {}),
      ...(patch.registration !== undefined ? { registration: patch.registration } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.waitlist !== undefined ? { waitlist: patch.waitlist } : {}),
      ...(patch.maxGuests !== undefined ? { maxGuests: patch.maxGuests } : {}),
    },
  });

  const retimed =
    (patch.rule !== undefined && patch.rule !== before.rule) ||
    (patch.timeZone !== undefined && patch.timeZone !== before.timeZone) ||
    (patch.startDate !== undefined && patch.startDate !== toIsoDate(before.startDate)) ||
    (patch.startTime !== undefined && patch.startTime !== before.startTime) ||
    (patch.durationMinutes !== undefined && patch.durationMinutes !== before.durationMinutes) ||
    (patch.allDay !== undefined && patch.allDay !== before.allDay);

  const upcoming = await prisma.event.findMany({
    where: { seriesId, occurrenceDate: { gte: fromIsoDate(today) } },
    select: { id: true, registrations: { where: { status: { not: "CANCELLED" } }, select: { id: true } } },
  });
  const booked = upcoming.filter((event) => event.registrations.length > 0).map((event) => event.id);
  const empty = upcoming.filter((event) => event.registrations.length === 0).map((event) => event.id);

  if (retimed) {
    // Clear the empty ones out so the new rule can lay them down again. The
    // booked ones keep their date, which also keeps the generator off it —
    // `datesToCreate` skips a date that already has a row.
    await prisma.event.deleteMany({ where: { id: { in: empty } } });
  }

  // Whether or not the timing moved, the description follows the series: a
  // renamed event is renamed everywhere it has not yet happened.
  const followers = retimed ? booked : [...empty, ...booked];
  const moved =
    followers.length === 0
      ? 0
      : (await prisma.event.updateMany({ where: { id: { in: followers } }, data: stampOf(series) })).count;

  const created = await generateOccurrences(seriesId, today);
  return { series, created, moved, stranded: retimed ? booked.length : 0 };
}

/**
 * Takes one date out of a series for good.
 *
 * The date goes onto the series' exclusion list in the same transaction as the
 * event is deleted — otherwise the next run of the generator would look at the
 * rule, see the gap, and put the cancelled meeting straight back.
 */
export async function removeOccurrence(eventId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { seriesId: true, occurrenceDate: true },
    });
    if (!event) throw new ApiError(404, "not_found", "That event no longer exists.");

    if (event.seriesId && event.occurrenceDate) {
      await tx.eventSeries.update({
        where: { id: event.seriesId },
        data: { excludedDates: { push: event.occurrenceDate } },
      });
    }
    await tx.event.delete({ where: { id: eventId } });
  });
}

/**
 * Stops a series repeating, on the rule set out in `stopSeriesPlan`: nothing
 * anybody has signed up for is deleted, and nothing already past is either.
 * What is kept becomes an ordinary one-off event.
 */
export async function stopSeries(seriesId: string, today: IsoDate = todayIso()) {
  const occurrences = await prisma.event.findMany({
    where: { seriesId },
    select: {
      id: true,
      occurrenceDate: true,
      registrations: { where: { status: { not: "CANCELLED" } }, select: { id: true } },
    },
  });

  const plan = stopSeriesPlan(
    occurrences.map((event) => ({
      id: event.id,
      date: event.occurrenceDate ? toIsoDate(event.occurrenceDate) : "1970-01-01",
      registrations: event.registrations.length,
    })),
    today,
  );

  await prisma.event.deleteMany({ where: { id: { in: plan.remove } } });
  // Detached explicitly rather than left to the SET NULL on the foreign key:
  // the occurrence date has to go too, or a one-off event is left carrying the
  // day-of-a-series it is no longer part of.
  await prisma.event.updateMany({
    where: { id: { in: plan.keep } },
    data: { seriesId: null, occurrenceDate: null },
  });
  await prisma.eventSeries.delete({ where: { id: seriesId } });

  return { removed: plan.remove.length, kept: plan.keep.length };
}

/**
 * Pushes every series' horizon forward, for the daily job.
 *
 * Bounded by the clock rather than by a count: a deployment with three series
 * and one with three hundred both need to finish inside a serverless
 * invocation, and the one that matters is how long it took, not how many it
 * got through. Oldest horizon first, so a series that missed a run is the next
 * one served rather than the last.
 */
export async function extendAllSeries(
  today: IsoDate = todayIso(),
  budgetMs = 40_000,
  now: () => number = Date.now,
): Promise<{ series: number; created: number; ranOut: boolean }> {
  const started = now();
  const due = await prisma.eventSeries.findMany({
    // Behind *today's* horizon, not behind today: the job's whole job is to
    // push the far end forward by a day, so a series generated yesterday is
    // exactly the one that needs another date on the end. Asking whether the
    // horizon had fallen into the past instead — which the first draft did —
    // finds nothing until a series is already six months stale.
    where: {
      OR: [{ generatedThrough: null }, { generatedThrough: { lt: fromIsoDate(horizonEnd(today)) } }],
    },
    orderBy: { generatedThrough: { sort: "asc", nulls: "first" } },
    select: { id: true },
  });

  let created = 0;
  let handled = 0;
  for (const series of due) {
    if (now() - started > budgetMs) return { series: handled, created, ranOut: true };
    try {
      created += await generateOccurrences(series.id, today);
    } catch (error) {
      // One series with an unparseable rule must not stop the rest getting
      // their dates — the same reasoning as every other scheduled job here.
      console.error(`Could not extend event series ${series.id}:`, error);
    }
    handled += 1;
  }
  return { series: handled, created, ranOut: false };
}
