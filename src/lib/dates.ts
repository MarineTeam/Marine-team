/**
 * Calendar-day handling.
 *
 * Every event in this app is anchored to a *calendar day*, not an instant.
 * "Breakbread on July 10" means July 10 wherever you are, so the domain model
 * carries plain `YYYY-MM-DD` strings and only converts to `Date` at the Prisma
 * boundary (as UTC midnight). Doing it this way removes an entire category of
 * off-by-one-day bugs that appear when a phone in one timezone renders a date
 * stored in another.
 */

/** A calendar day in ISO form, e.g. "2026-07-10". */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject impossible days such as 2026-02-30.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function assertIsoDate(value: unknown): IsoDate {
  if (!isIsoDate(value)) {
    throw new TypeError(`Expected an ISO calendar date (YYYY-MM-DD), received: ${String(value)}`);
  }
  return value;
}

/** Build an ISO date from numeric parts, normalizing overflow (month 13 -> next year). */
export function isoDateFromParts(year: number, month1Based: number, day: number): IsoDate {
  const probe = new Date(Date.UTC(year, month1Based - 1, day));
  return toIsoDate(probe);
}

/** Format a `Date` as an ISO calendar day using its UTC fields. */
export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Convert an ISO calendar day to the UTC-midnight `Date` Prisma stores. */
export function fromIsoDate(value: IsoDate): Date {
  const [year, month, day] = assertIsoDate(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Today's calendar day in a given IANA timezone.
 *
 * Defaults to the runtime timezone, which on a phone is the user's own.
 */
export function todayIso(timeZone?: string, now: Date = new Date()): IsoDate {
  if (!timeZone) {
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return partsInTimeZone(timeZone, now).date;
}

/** The local clock hour (0-23) in a given IANA timezone. */
export function hourInTimeZone(timeZone: string, now: Date = new Date()): number {
  return partsInTimeZone(timeZone, now).hour;
}

/**
 * The calendar day and clock hour somewhere else in the world.
 *
 * Through `Intl` rather than a timezone library: these two answers are the
 * only ones this app needs from one, and the platform has had the rules —
 * including every daylight-saving transition — built in for years.
 *
 * An unusable zone name falls back to UTC rather than throwing. A reminder
 * arriving at the wrong hour is a poor outcome; a scheduled job dying on one
 * bad row of subscriber data, and so sending nobody anything, is worse.
 */
function partsInTimeZone(timeZone: string, now: Date): { date: IsoDate; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    if (!isIsoDate(date)) throw new RangeError(`Unusable timezone: ${timeZone}`);
    return { date, hour: Number(value("hour")) };
  } catch {
    return { date: toIsoDate(now), hour: now.getUTCHours() };
  }
}

/** Add days to an ISO calendar day. Negative values move backwards. */
export function addIsoDays(value: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Whole days between two ISO calendar days (`to - from`). */
export function isoDayDifference(from: IsoDate, to: IsoDate): number {
  const millis = fromIsoDate(to).getTime() - fromIsoDate(from).getTime();
  return Math.round(millis / 86_400_000);
}

/** Lexicographic comparison works for ISO dates and is the canonical ordering. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function weekdayName(value: IsoDate): string {
  return WEEKDAY_LONG[fromIsoDate(value).getUTCDay()];
}

export function monthName(monthIndex0Based: number): string {
  return MONTH_LONG[monthIndex0Based];
}

/**
 * Human label for an ISO date, e.g. "Sun, Jul 12".
 * Deliberately timezone-free: the string is built from the date's own parts.
 */
export function formatIsoDate(
  value: IsoDate,
  options: { weekday?: boolean; year?: boolean } = {},
): string {
  const date = fromIsoDate(value);
  const weekday = WEEKDAY_LONG[date.getUTCDay()].slice(0, 3);
  const month = MONTH_LONG[date.getUTCMonth()].slice(0, 3);
  const day = date.getUTCDate();
  const parts: string[] = [];
  if (options.weekday !== false) parts.push(`${weekday},`);
  parts.push(month, String(day));
  if (options.year) parts.push(String(date.getUTCFullYear()));
  return parts.join(" ");
}

/** "Today", "Tomorrow", "Yesterday", or a formatted date. */
export function relativeDayLabel(value: IsoDate, today: IsoDate): string {
  const difference = isoDayDifference(today, value);
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference === -1) return "Yesterday";
  if (difference > 1 && difference < 7) return weekdayName(value);
  const includeYear = value.slice(0, 4) !== today.slice(0, 4);
  return formatIsoDate(value, { year: includeYear });
}

/**
 * True when `relativeDayLabel` returned a word rather than a date.
 *
 * List headings pair the relative label with the calendar date ("Sunday ·
 * Aug 23"), which reads well for "Today" and "Sunday" but produces a silly
 * "Sun, Sep 6 · Sep 6" once the label is already a date. This lets a caller
 * drop the redundant half.
 */
export function isRelativeDayLabel(value: IsoDate, today: IsoDate): boolean {
  const difference = isoDayDifference(today, value);
  return difference >= -1 && difference < 7;
}

/** Every ISO day in `[start, end]`, inclusive. Capped to avoid runaway loops. */
export function isoDateRange(start: IsoDate, end: IsoDate, maxDays = 400): IsoDate[] {
  const days: IsoDate[] = [];
  let cursor = assertIsoDate(start);
  const last = assertIsoDate(end);
  while (compareIsoDates(cursor, last) <= 0 && days.length < maxDays) {
    days.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return days;
}

/**
 * The grid of days shown by a month view: the target month padded out to whole
 * weeks so the calendar always renders complete rows.
 */
export function monthGrid(
  year: number,
  month1Based: number,
  weekStartsOn: 0 | 1 = 0,
): IsoDate[] {
  const first = new Date(Date.UTC(year, month1Based - 1, 1));
  const leading = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const start = addIsoDays(toIsoDate(first), -leading);
  // Six weeks always covers any month layout.
  return Array.from({ length: 42 }, (_unused, index) => addIsoDays(start, index));
}

/** Validate an "HH:mm" clock time. */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "14:30" -> "2:30 PM". Returns the input unchanged if it is not a clock time. */
export function formatClockTime(value: string): string {
  if (!isClockTime(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${displayHour} ${suffix}`
    : `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** Absolute timestamp label for the "Last synchronized" line. */
export function formatSyncTimestamp(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
