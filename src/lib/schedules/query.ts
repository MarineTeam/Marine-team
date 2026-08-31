import type { Prisma } from "@prisma/client";
import { addIsoDays, fromIsoDate, todayIso, toIsoDate, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { CalendarEvent, Person, Schedule } from "@/lib/schedules/types";

/**
 * The read layer.
 *
 * Every public read goes through here, and every function returns the
 * normalized model from `types.ts`. Google Sheets events and admin-created
 * events are indistinguishable by this point -- they are the same rows in the
 * same table -- which is exactly the property the architecture is built for.
 */

type ScheduleRow = Prisma.ScheduleGetPayload<{ include: { source: true } }>;
type EventRow = Prisma.CalendarEventGetPayload<{
  include: { people: { include: { person: true } } };
}>;

export function serializeSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    enabled: row.enabled,
    displayOrder: row.displayOrder,
    sourceType: row.sourceType,
    lastSyncedAt: row.source?.lastSyncedAt?.toISOString() ?? null,
    lastSyncStatus: row.source?.lastSyncStatus ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    date: toIsoDate(row.date),
    endDate: row.endDate ? toIsoDate(row.endDate) : null,
    allDay: row.allDay,
    startTime: row.startTime,
    endTime: row.endTime,
    title: row.title,
    notes: row.notes,
    location: row.location,
    status: row.status,
    // Deliberately not sorted by name: the order people were listed in is
    // information ("Devin & Cindy" means Devin has bread, Cindy has cup), so
    // it is preserved all the way from the source to the screen.
    people: row.people.map((link) => ({
      personId: link.personId,
      displayName: link.person.displayName,
      role: link.role,
    })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const eventInclude = {
  people: {
    include: { person: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.CalendarEventInclude;

/** Enabled, non-deleted schedules in display order. */
export async function listPublicSchedules(): Promise<Schedule[]> {
  const rows = await prisma.schedule.findMany({
    where: { deletedAt: null, enabled: true },
    include: { source: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeSchedule);
}

/** Every schedule including disabled ones, for the admin UI. */
export async function listAllSchedules(): Promise<Schedule[]> {
  const rows = await prisma.schedule.findMany({
    where: { deletedAt: null },
    include: { source: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeSchedule);
}

export async function listPeople(): Promise<Person[]> {
  const rows = await prisma.person.findMany({
    where: { deletedAt: null, active: true },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, normalizedName: true },
  });
  return rows;
}

export interface EventQuery {
  scheduleIds?: readonly string[];
  personId?: string;
  from?: IsoDate;
  to?: IsoDate;
  limit?: number;
  /** Include events belonging to disabled schedules. Admin only. */
  includeDisabledSchedules?: boolean;
}

/** The default read window: recent history plus a generous look-ahead. */
export const DEFAULT_PAST_WINDOW_DAYS = 60;
export const DEFAULT_FUTURE_WINDOW_DAYS = 365;
export const MAX_EVENT_LIMIT = 2000;

export async function listEvents(query: EventQuery = {}): Promise<CalendarEvent[]> {
  const today = todayIso();
  const from = query.from ?? addIsoDays(today, -DEFAULT_PAST_WINDOW_DAYS);
  const to = query.to ?? addIsoDays(today, DEFAULT_FUTURE_WINDOW_DAYS);

  const where: Prisma.CalendarEventWhereInput = {
    deletedAt: null,
    date: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
    schedule: query.includeDisabledSchedules
      ? { deletedAt: null }
      : { deletedAt: null, enabled: true },
  };

  if (query.scheduleIds && query.scheduleIds.length > 0) {
    where.scheduleId = { in: [...query.scheduleIds] };
  }
  if (query.personId) {
    where.people = { some: { personId: query.personId } };
  }

  const rows = await prisma.calendarEvent.findMany({
    where,
    include: eventInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: Math.min(query.limit ?? MAX_EVENT_LIMIT, MAX_EVENT_LIMIT),
  });

  return rows.map(serializeEvent);
}

export async function getEvent(eventId: string): Promise<CalendarEvent | null> {
  const row = await prisma.calendarEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    include: eventInclude,
  });
  return row ? serializeEvent(row) : null;
}

/**
 * The offline snapshot.
 *
 * With no `since` this returns everything the client needs for a cold start.
 * With `since` it returns only rows touched afterwards, plus the ids of things
 * that were deleted -- so a phone that has been offline for a week catches up
 * with a payload measured in kilobytes rather than re-downloading the lot.
 */
export interface SnapshotOptions {
  since?: Date | null;
  pastWindowDays?: number;
  futureWindowDays?: number;
}

export interface Snapshot {
  schedules: Schedule[];
  people: Person[];
  events: CalendarEvent[];
  deleted: { scheduleIds: string[]; eventIds: string[]; personIds: string[] };
  /** Server time this snapshot was taken; the client sends it back as `since`. */
  syncedAt: string;
  /** True when the client must discard its cache first (full refresh). */
  full: boolean;
  window: { from: IsoDate; to: IsoDate };
}

export async function buildSnapshot(options: SnapshotOptions = {}): Promise<Snapshot> {
  // Take the timestamp *before* reading, so a row written mid-query is picked
  // up by the next incremental sync rather than missed entirely.
  const syncedAt = new Date();
  const today = todayIso();
  const from = addIsoDays(today, -(options.pastWindowDays ?? DEFAULT_PAST_WINDOW_DAYS));
  const to = addIsoDays(today, options.futureWindowDays ?? DEFAULT_FUTURE_WINDOW_DAYS);
  const since = options.since ?? null;
  const full = since === null;

  const dateWindow = { gte: fromIsoDate(from), lte: fromIsoDate(to) };

  const [scheduleRows, personRows, eventRows] = await Promise.all([
    prisma.schedule.findMany({
      where: full
        ? { deletedAt: null, enabled: true }
        : { OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }] },
      include: { source: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.person.findMany({
      where: full
        ? { deletedAt: null, active: true }
        : { OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }] },
      orderBy: { displayName: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: full
        ? { deletedAt: null, date: dateWindow, schedule: { deletedAt: null, enabled: true } }
        : { updatedAt: { gt: since }, date: dateWindow },
      include: eventInclude,
      orderBy: [{ date: "asc" }],
      take: MAX_EVENT_LIMIT,
    }),
  ]);

  const liveSchedules = scheduleRows.filter((row) => row.deletedAt === null && row.enabled);
  const deadSchedules = scheduleRows.filter((row) => row.deletedAt !== null || !row.enabled);
  const livePeople = personRows.filter((row) => row.deletedAt === null && row.active);
  const deadPeople = personRows.filter((row) => row.deletedAt !== null || !row.active);
  const deadScheduleIds = new Set(deadSchedules.map((row) => row.id));
  const liveEvents = eventRows.filter(
    (row) => row.deletedAt === null && !deadScheduleIds.has(row.scheduleId),
  );
  const deadEvents = eventRows.filter(
    (row) => row.deletedAt !== null || deadScheduleIds.has(row.scheduleId),
  );

  return {
    schedules: liveSchedules.map(serializeSchedule),
    people: livePeople.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      normalizedName: row.normalizedName,
    })),
    events: liveEvents.map(serializeEvent),
    deleted: {
      scheduleIds: deadSchedules.map((row) => row.id),
      eventIds: deadEvents.map((row) => row.id),
      personIds: deadPeople.map((row) => row.id),
    },
    syncedAt: syncedAt.toISOString(),
    full,
    window: { from, to },
  };
}
