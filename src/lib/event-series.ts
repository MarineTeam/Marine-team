import type { EventSeries } from "@prisma/client";
import { addIsoDays, compareIsoDates, fromIsoDate, toIsoDate, type IsoDate } from "@/lib/dates";
import {
  WEEKDAY_CODES,
  daysInMonth,
  describeRule,
  isKnownTimeZone,
  occurrencesBetween,
  parseRule,
  zonedInstant,
  type WeekdayCode,
} from "@/lib/recurrence";

/**
 * A repeating event, and the dates it turns into.
 *
 * The model decision worth stating: **a series is not itself an event.** Every
 * date it produces is an ordinary `Event` row with its own slug, capacity and
 * sign-up list, because "is there a place for me on the 14th" is a different
 * question from "is there a place on the 21st" and only a real row can answer
 * both. Modelling the series as its own first event — which is what the
 * calendar port's `CalendarEvent.parentEventId` does — makes deleting the first
 * meeting of the year an act that deletes the year.
 *
 * Everything here is pure. The dates come from `recurrence.ts`; turning them
 * into instants is `zonedInstant`, for the reason set out there: "Tuesdays at
 * 19:30" is a wall clock, and a series expanded as instants loses an hour every
 * March.
 */

export type SeriesShape = {
  rule: string;
  timeZone: string;
  startDate: IsoDate;
  /** "19:30". Null when the occurrences are all-day. */
  startTime: string | null;
  durationMinutes: number | null;
  allDay: boolean;
  opensDaysBefore: number | null;
  closesDaysBefore: number | null;
};

/**
 * A stored series in the shape the planner wants. A projection, not a query —
 * it lives here so a page showing "Every Tuesday, 19:30" can reach it without
 * pulling the write layer, and Prisma's own types in.
 */
export function shapeOf(series: EventSeries): SeriesShape {
  return {
    rule: series.rule,
    timeZone: series.timeZone,
    startDate: toIsoDate(series.startDate),
    startTime: series.startTime,
    durationMinutes: series.durationMinutes,
    allDay: series.allDay,
    opensDaysBefore: series.opensDaysBefore,
    closesDaysBefore: series.closesDaysBefore,
  };
}

export type PlannedOccurrence = {
  date: IsoDate;
  startsAt: Date;
  endsAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
};

/**
 * How far ahead occurrences are created.
 *
 * Six months is enough that a member browsing "what's on" sees a term's worth,
 * and short enough that a weekly event is 26 rows rather than a rule expanded
 * to the heat death of the diary. A daily job pushes the horizon forward, so
 * the far end never arrives.
 */
export const HORIZON_DAYS = 180;

export function horizonEnd(today: IsoDate): IsoDate {
  return addIsoDays(today, HORIZON_DAYS);
}

/**
 * The dates this series lands on in a window, with the instants each one runs
 * between and the sign-up window around it.
 *
 * The sign-up window is stored as "days before" rather than as two instants,
 * because that is what a repeating event means. Copying one pair of instants
 * onto every date would close December's sign-up in September. Read as:
 * **opens at the start of the day N days before, closes at the end of the day
 * N days before** — whole days, because that is how anybody says it out loud.
 */
export function planOccurrences(series: SeriesShape, from: IsoDate, to: IsoDate): PlannedOccurrence[] {
  const rule = parseRule(series.rule);
  const zone = series.timeZone;
  const time = series.allDay ? "00:00" : (series.startTime ?? "00:00");

  return occurrencesBetween(rule, series.startDate, from, to).map((date) => {
    const startsAt = zonedInstant(date, time, zone);
    return {
      date,
      startsAt,
      endsAt:
        series.durationMinutes === null || series.durationMinutes === undefined
          ? null
          : new Date(startsAt.getTime() + series.durationMinutes * 60_000),
      opensAt:
        series.opensDaysBefore === null ? null : zonedInstant(addIsoDays(date, -series.opensDaysBefore), "00:00", zone),
      // The *end* of that day, which is midnight at the start of the next one.
      closesAt:
        series.closesDaysBefore === null
          ? null
          : zonedInstant(addIsoDays(date, 1 - series.closesDaysBefore), "00:00", zone),
    };
  });
}

/**
 * The occurrences that need creating: planned, minus what already exists,
 * minus the dates somebody took out.
 *
 * The exclusion list is why deleting one date sticks. Without it the next run
 * of the generator would look at the rule, see a gap, and helpfully put the
 * cancelled meeting back.
 */
export function datesToCreate(
  planned: readonly PlannedOccurrence[],
  existing: Iterable<IsoDate>,
  excluded: Iterable<IsoDate>,
): PlannedOccurrence[] {
  const have = new Set(existing);
  const gone = new Set(excluded);
  return planned.filter((occurrence) => !have.has(occurrence.date) && !gone.has(occurrence.date));
}

export type OccurrenceRow = {
  id: string;
  date: IsoDate;
  /** How many people are down for it, cancellations aside. */
  registrations: number;
};

/**
 * What stopping a series does to the dates it already made.
 *
 * One rule decides it: **a sign-up is a promise to a person, and unscheduling
 * is not a way to break it.** So an occurrence anybody has signed up for stays,
 * and so does anything already past — that is the record of what happened.
 * Everything still to come with nobody down for it is removed, because those
 * are the empty diary entries the organiser meant to be rid of.
 *
 * Kept occurrences are detached rather than deleted, which is why the foreign
 * key is `SET NULL`: they become ordinary one-off events that the organiser can
 * cancel one at a time, having seen who is on them.
 */
export function stopSeriesPlan(
  occurrences: readonly OccurrenceRow[],
  today: IsoDate,
): { remove: string[]; keep: string[] } {
  const remove: string[] = [];
  const keep: string[] = [];
  for (const occurrence of occurrences) {
    const future = compareIsoDates(occurrence.date, today) >= 0;
    if (future && occurrence.registrations === 0) remove.push(occurrence.id);
    else keep.push(occurrence.id);
  }
  return { remove, keep };
}

/**
 * Everything wrong with a series somebody just filled in, in the order it
 * should be read out. Empty means it is fit to save.
 */
export function seriesProblems(series: SeriesShape): string[] {
  const problems: string[] = [];

  try {
    parseRule(series.rule);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "That repeat rule can't be read");
  }

  if (!isKnownTimeZone(series.timeZone)) problems.push(`Unknown time zone: ${series.timeZone}`);
  if (!series.allDay && !series.startTime) problems.push("Give a start time, or mark it all day");

  if (series.durationMinutes !== null && series.durationMinutes <= 0) {
    problems.push("A length has to be more than nothing");
  }

  const opens = series.opensDaysBefore;
  const closes = series.closesDaysBefore;
  if (opens !== null && opens < 0) problems.push("Sign-up can't open after the event");
  if (closes !== null && closes < 0) problems.push("Sign-up can't close after the event");
  if (opens !== null && closes !== null && closes > opens) {
    // Opening "7 days before" and closing "14 days before" is a window that
    // shuts a week before it opens, which no error further down would explain.
    problems.push("Sign-up would close before it opened");
  }

  return problems;
}

/** The series as a sentence, for a listing: "Every Tuesday, 19:30". */
export function describeSeries(series: SeriesShape): string {
  let sentence: string;
  try {
    sentence = describeRule(parseRule(series.rule), series.startDate);
  } catch {
    return "Repeats";
  }
  if (series.allDay || !series.startTime) return sentence;
  return `${sentence}, ${series.startTime}`;
}

// ------------------------------------------------------- the admin's form --

/**
 * The five repeats an admin form offers.
 *
 * Not the whole of RRULE, and deliberately: a form with every field the RFC
 * allows is a form nobody fills in correctly. These are the five a church diary
 * actually contains, and each one is a single choice rather than a combination
 * somebody has to get right.
 */
export type RepeatShape = "DAILY" | "WEEKLY" | "MONTHLY_DAY" | "MONTHLY_WEEKDAY" | "MONTHLY_LAST_WEEKDAY";

export type RepeatChoices = {
  shape: RepeatShape;
  /** Every n days/weeks/months. */
  interval: number;
  /** Weekly only. Empty means "whichever day the first date is". */
  weekdays: readonly WeekdayCode[];
  startDate: IsoDate;
  ends: { kind: "never" } | { kind: "count"; count: number } | { kind: "until"; until: IsoDate };
};

/** Where a date sits in its month, which is what the monthly options are named after. */
export function monthPositionOf(date: IsoDate): { weekday: WeekdayCode; nth: number; isLast: boolean } {
  const day = fromIsoDate(date);
  const dayOfMonth = day.getUTCDate();
  return {
    weekday: WEEKDAY_CODES[day.getUTCDay()],
    nth: Math.ceil(dayOfMonth / 7),
    isLast: dayOfMonth + 7 > daysInMonth(day.getUTCFullYear(), day.getUTCMonth() + 1),
  };
}

/**
 * The form's answers as an RRULE.
 *
 * The monthly shapes read their weekday and their position off the first date
 * rather than asking for them again — somebody who picked the 6th of September
 * has already said "the first Sunday", and asking twice is how the two come to
 * disagree.
 */
export function ruleFromChoices(choices: RepeatChoices): string {
  const position = monthPositionOf(choices.startDate);
  const parts: string[] = [choices.shape === "DAILY" ? "FREQ=DAILY" : choices.shape === "WEEKLY" ? "FREQ=WEEKLY" : "FREQ=MONTHLY"];

  if (choices.interval > 1) parts.push(`INTERVAL=${choices.interval}`);

  if (choices.shape === "WEEKLY") {
    const days = choices.weekdays.length > 0 ? [...choices.weekdays] : [position.weekday];
    parts.push(`BYDAY=${days.sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b)).join(",")}`);
  }
  if (choices.shape === "MONTHLY_DAY") parts.push(`BYMONTHDAY=${fromIsoDate(choices.startDate).getUTCDate()}`);
  if (choices.shape === "MONTHLY_WEEKDAY") parts.push(`BYDAY=${position.nth}${position.weekday}`);
  if (choices.shape === "MONTHLY_LAST_WEEKDAY") parts.push(`BYDAY=-1${position.weekday}`);

  if (choices.ends.kind === "count") parts.push(`COUNT=${Math.max(1, Math.trunc(choices.ends.count))}`);
  if (choices.ends.kind === "until") parts.push(`UNTIL=${choices.ends.until.replace(/-/g, "")}`);

  return parts.join(";");
}
