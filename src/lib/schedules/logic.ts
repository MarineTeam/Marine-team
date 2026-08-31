/**
 * Pure schedule logic shared by the server and the offline client.
 *
 * Everything here operates on the normalized `CalendarEvent` model and has no
 * dependency on Prisma, Dexie, React or the network -- which is what lets the
 * home screen behave identically whether it is rendering fresh data or a
 * cached snapshot pulled out of IndexedDB while the phone is in aeroplane
 * mode.
 */

import { addIsoDays, compareIsoDates, isoDayDifference, type IsoDate } from "@/lib/dates";
import { normalizeName } from "@/lib/names";
import type { CalendarEvent, Schedule } from "@/lib/schedules/types";

export interface EventFilter {
  /** Only events this person is involved in. */
  personId?: string | null;
  /** Only events from these schedules. Empty/undefined means all schedules. */
  scheduleIds?: readonly string[] | null;
  /** Drop cancelled events. Defaults to true. */
  hideCancelled?: boolean;
}

/** Does this event involve the given person? */
export function involvesPerson(event: CalendarEvent, personId: string): boolean {
  return event.people.some((participant) => participant.personId === personId);
}

/** Apply person/schedule/status filters. Order is preserved. */
export function filterEvents(
  events: readonly CalendarEvent[],
  filter: EventFilter = {},
): CalendarEvent[] {
  const scheduleIds =
    filter.scheduleIds && filter.scheduleIds.length > 0 ? new Set(filter.scheduleIds) : null;
  const hideCancelled = filter.hideCancelled ?? true;

  return events.filter((event) => {
    if (hideCancelled && event.status === "CANCELLED") return false;
    if (scheduleIds && !scheduleIds.has(event.scheduleId)) return false;
    if (filter.personId && !involvesPerson(event, filter.personId)) return false;
    return true;
  });
}

/**
 * Sort by date, then by start time, then by schedule so the ordering is
 * deterministic (important: the same list must not reshuffle between a cached
 * render and a fresh one).
 */
export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const byDate = compareIsoDates(a.date, b.date);
    if (byDate !== 0) return byDate;
    const aTime = a.startTime ?? "";
    const bTime = b.startTime ?? "";
    if (aTime !== bTime) {
      if (!aTime) return -1; // All-day events sort before timed ones.
      if (!bTime) return 1;
      return aTime < bTime ? -1 : 1;
    }
    if (a.scheduleId !== b.scheduleId) return a.scheduleId < b.scheduleId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Events occurring on exactly `today`, including multi-day events spanning it. */
export function eventsOnDay(
  events: readonly CalendarEvent[],
  day: IsoDate,
  filter?: EventFilter,
): CalendarEvent[] {
  return sortEvents(
    filterEvents(events, filter).filter((event) => coversDay(event, day)),
  );
}

/** True when `day` falls inside the event's date span. */
export function coversDay(event: CalendarEvent, day: IsoDate): boolean {
  if (compareIsoDates(event.date, day) === 0) return true;
  if (!event.endDate) return false;
  return (
    compareIsoDates(event.date, day) <= 0 && compareIsoDates(event.endDate, day) >= 0
  );
}

export interface UpcomingOptions extends EventFilter {
  /** How far ahead to look. Defaults to 120 days. */
  horizonDays?: number;
  /** Cap on returned events. Defaults to 50. */
  limit?: number;
  /** Include events happening today. Defaults to false (Today has its own section). */
  includeToday?: boolean;
}

/** Events strictly after today (or including today), soonest first. */
export function upcomingEvents(
  events: readonly CalendarEvent[],
  today: IsoDate,
  options: UpcomingOptions = {},
): CalendarEvent[] {
  const horizon = addIsoDays(today, options.horizonDays ?? 120);
  const includeToday = options.includeToday ?? false;
  const limit = options.limit ?? 50;

  const matching = filterEvents(events, options).filter((event) => {
    const comparison = compareIsoDates(event.date, today);
    if (comparison < 0) {
      // A multi-day event that started earlier is still "upcoming" while it runs.
      return includeToday && event.endDate !== null && compareIsoDates(event.endDate, today) >= 0;
    }
    if (comparison === 0) return includeToday;
    return compareIsoDates(event.date, horizon) <= 0;
  });

  return sortEvents(matching).slice(0, limit);
}

/** Events before today, most recent first. */
export function pastEvents(
  events: readonly CalendarEvent[],
  today: IsoDate,
  options: EventFilter & { limit?: number } = {},
): CalendarEvent[] {
  const matching = filterEvents(events, options).filter((event) => {
    const end = event.endDate ?? event.date;
    return compareIsoDates(end, today) < 0;
  });
  return sortEvents(matching)
    .reverse()
    .slice(0, options.limit ?? 50);
}

/** The next single event involving a person, or null. */
export function nextEventForPerson(
  events: readonly CalendarEvent[],
  personId: string,
  today: IsoDate,
): CalendarEvent | null {
  const [next] = upcomingEvents(events, today, {
    personId,
    includeToday: true,
    limit: 1,
  });
  return next ?? null;
}

export interface DayGroup {
  date: IsoDate;
  events: CalendarEvent[];
}

/** Group a sorted event list into day buckets, for the list/calendar views. */
export function groupByDay(events: readonly CalendarEvent[]): DayGroup[] {
  const groups = new Map<IsoDate, CalendarEvent[]>();
  for (const event of sortEvents(events)) {
    const bucket = groups.get(event.date);
    if (bucket) bucket.push(event);
    else groups.set(event.date, [event]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareIsoDates(a, b))
    .map(([date, dayEvents]) => ({ date, events: dayEvents }));
}

/** Days in `[from, to]` that have at least one matching event -- for month dots. */
export function daysWithEvents(
  events: readonly CalendarEvent[],
  filter?: EventFilter,
): Set<IsoDate> {
  const days = new Set<IsoDate>();
  for (const event of filterEvents(events, filter)) {
    days.add(event.date);
    if (event.endDate) {
      let cursor = event.date;
      // Multi-day events are short in practice; the cap prevents a corrupt
      // endDate from spinning here.
      for (let step = 0; step < 60 && compareIsoDates(cursor, event.endDate) < 0; step += 1) {
        cursor = addIsoDays(cursor, 1);
        days.add(cursor);
      }
    }
  }
  return days;
}

/** Everyone appearing in the given events, deduped by person id and sorted. */
export function peopleInEvents(
  events: readonly CalendarEvent[],
): Array<{ id: string; displayName: string }> {
  const people = new Map<string, string>();
  for (const event of events) {
    for (const participant of event.people) {
      if (!people.has(participant.personId)) {
        people.set(participant.personId, participant.displayName);
      }
    }
  }
  return [...people.entries()]
    .map(([id, displayName]) => ({ id, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * "Devin & Cindy", "Devin, Cindy & John", "Nobody assigned".
 * Kept here (rather than in a component) so the same phrasing is used by the
 * home screen, the calendar list and the push notification body.
 */
export function describeParticipants(event: CalendarEvent): string {
  const names = event.people.map((participant) => participant.displayName);
  if (names.length === 0) return "No one assigned";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** Only enabled schedules, in the order an admin arranged them. */
export function visibleSchedules(schedules: readonly Schedule[]): Schedule[] {
  return [...schedules]
    .filter((schedule) => schedule.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

/** Look up a schedule by id, with a stable fallback for orphaned events. */
export function scheduleLookup(schedules: readonly Schedule[]): Map<string, Schedule> {
  return new Map(schedules.map((schedule) => [schedule.id, schedule]));
}

/**
 * Match a stored name preference back to a person after a rename.
 *
 * The selected person is stored on the device by id, but if that person was
 * deleted and recreated (which a spreadsheet rename can cause), fall back to
 * matching on the normalized name so the user is not silently logged out of
 * their own schedule.
 */
export function resolveSelectedPerson<T extends { id: string; displayName: string }>(
  people: readonly T[],
  selection: { id?: string | null; displayName?: string | null } | null,
): T | null {
  if (!selection) return null;
  if (selection.id) {
    const byId = people.find((person) => person.id === selection.id);
    if (byId) return byId;
  }
  if (selection.displayName) {
    const wanted = normalizeName(selection.displayName);
    const byName = people.find((person) => normalizeName(person.displayName) === wanted);
    if (byName) return byName;
  }
  return null;
}

/** How many days until an event; negative for past. */
export function daysUntil(event: CalendarEvent, today: IsoDate): number {
  return isoDayDifference(today, event.date);
}
