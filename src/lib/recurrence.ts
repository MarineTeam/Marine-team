import { addIsoDays, compareIsoDates, fromIsoDate, isIsoDate, isoDateFromParts, toIsoDate, type IsoDate } from "@/lib/dates";

/**
 * "Every Tuesday", "the first Sunday of the month", "alternate Wednesdays" —
 * as a rule that can be written down once and unfolded into dates.
 *
 * Two things in this app already needed this and neither had it. `CalendarEvent`
 * has carried `recurrenceRule` and `recurrenceEndDate` columns since the
 * calendar port, the admin service writes them, the validator accepts them —
 * and nothing anywhere reads them back, so a rota saved as "FREQ=WEEKLY;BYDAY=SU"
 * shows exactly one Sunday. A column that stores a promise nobody keeps is
 * worse than no column. And an `Event` people sign up for has no recurrence at
 * all, so a weekly Bible study is twelve events typed twelve times.
 *
 * ## Why a subset of RFC 5545, and which subset
 *
 * The syntax is real RRULE, because it is what iCalendar exports, what Google
 * and Outlook feeds carry, and what the existing columns already claim to hold.
 * The *supported* subset is what a church diary actually says:
 *
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY   INTERVAL=n
 *   BYDAY=MO,WE,FR   BYDAY=1SU / -1SU (monthly: first / last Sunday)
 *   BYMONTHDAY=15    COUNT=n   UNTIL=YYYYMMDD
 *
 * Everything else — BYSETPOS, BYWEEKNO, BYHOUR, WKST, sub-daily frequencies —
 * is refused at parse time rather than silently ignored. Ignoring a part of a
 * rule produces the wrong dates while looking like it worked, and these dates
 * are what somebody turns up on.
 *
 * ## Why dates, not instants
 *
 * Everything here works in calendar days, the discipline `dates.ts` sets out.
 * A weekly event is "Tuesdays", and the fact that one particular Tuesday is
 * 19:30 in London and therefore 18:30 UTC in winter and 17:30 UTC in summer is
 * a *separate* question, answered once at the end by `zonedInstant`. Expanding
 * instants directly is how a 7.30pm meeting drifts to 6.30pm every March.
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Sunday-first, matching `Date.getUTCDay` and RFC 5545's own ordering. */
export const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** A weekday, optionally the nth (or nth-from-last) one in its month. */
export type ByDay = { weekday: WeekdayCode; nth: number | null };

export type Recurrence = {
  freq: Frequency;
  /** Every `interval` days/weeks/months/years. At least 1. */
  interval: number;
  /** Empty means "the same weekday as the start date" for WEEKLY. */
  byDay: ByDay[];
  /** Days of the month, 1-31 or negative from the end. Empty means "the start date's". */
  byMonthDay: number[];
  /** Stop after this many occurrences, counting the first. */
  count: number | null;
  /** Stop after this date, inclusive. */
  until: IsoDate | null;
};

const DEFAULTS: Omit<Recurrence, "freq"> = {
  interval: 1,
  byDay: [],
  byMonthDay: [],
  count: null,
  until: null,
};

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrenceError";
  }
}

/**
 * Parses an RRULE string, throwing on anything this app would get wrong.
 *
 * A leading "RRULE:" is accepted because that is how the line appears in an
 * .ics file, and somebody pasting one in should not have to know to trim it.
 */
export function parseRule(text: string): Recurrence {
  const body = text.trim().replace(/^RRULE:/i, "");
  if (body === "") throw new RecurrenceError("Empty recurrence rule");

  const parts = new Map<string, string>();
  for (const chunk of body.split(";")) {
    if (chunk.trim() === "") continue;
    const equals = chunk.indexOf("=");
    if (equals < 1) throw new RecurrenceError(`Not a NAME=VALUE part: ${chunk}`);
    const name = chunk.slice(0, equals).trim().toUpperCase();
    if (parts.has(name)) throw new RecurrenceError(`${name} given twice`);
    parts.set(name, chunk.slice(equals + 1).trim().toUpperCase());
  }

  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "COUNT", "UNTIL"]);
  for (const name of parts.keys()) {
    // Refused, not ignored: a rule carrying BYSETPOS means something this
    // cannot compute, and answering with the dates it *can* compute would be
    // a wrong answer wearing a right one's clothes.
    if (!known.has(name)) throw new RecurrenceError(`Unsupported rule part: ${name}`);
  }

  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    throw new RecurrenceError(`Unsupported FREQ: ${freq ?? "(missing)"}`);
  }

  const rule: Recurrence = { ...DEFAULTS, freq };

  const interval = parts.get("INTERVAL");
  if (interval !== undefined) {
    const value = Number(interval);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw new RecurrenceError(`INTERVAL must be a whole number of at least 1: ${interval}`);
    }
    rule.interval = value;
  }

  const byDay = parts.get("BYDAY");
  if (byDay !== undefined && byDay !== "") {
    rule.byDay = byDay.split(",").map((entry) => parseByDay(entry.trim(), rule.freq));
  }

  const byMonthDay = parts.get("BYMONTHDAY");
  if (byMonthDay !== undefined && byMonthDay !== "") {
    if (rule.freq === "WEEKLY" || rule.freq === "DAILY") {
      throw new RecurrenceError("BYMONTHDAY makes no sense with a daily or weekly rule");
    }
    rule.byMonthDay = byMonthDay.split(",").map((entry) => {
      const value = Number(entry.trim());
      if (!Number.isInteger(value) || value === 0 || value < -31 || value > 31) {
        throw new RecurrenceError(`BYMONTHDAY must be 1..31 or -1..-31: ${entry}`);
      }
      return value;
    });
  }

  if (rule.byDay.length > 0 && rule.byMonthDay.length > 0) {
    // "The first Sunday, and also the 15th" is two rules, and the RFC's
    // interaction between the two is not what anybody types it expecting.
    throw new RecurrenceError("Give BYDAY or BYMONTHDAY, not both");
  }

  const count = parts.get("COUNT");
  if (count !== undefined) {
    const value = Number(count);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw new RecurrenceError(`COUNT must be a whole number of at least 1: ${count}`);
    }
    rule.count = value;
  }

  const until = parts.get("UNTIL");
  if (until !== undefined) {
    rule.until = parseUntil(until);
  }

  if (rule.count !== null && rule.until !== null) {
    throw new RecurrenceError("Give COUNT or UNTIL, not both");
  }

  return rule;
}

function parseByDay(entry: string, freq: Frequency): ByDay {
  const match = /^(-?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(entry);
  if (!match) throw new RecurrenceError(`Not a weekday: ${entry}`);
  const weekday = match[2] as WeekdayCode;
  if (match[1] === undefined) return { weekday, nth: null };

  const nth = Number(match[1]);
  if (freq !== "MONTHLY" && freq !== "YEARLY") {
    // "the 2nd Tuesday of the week" is not a thing anybody means.
    throw new RecurrenceError(`A numbered weekday needs a monthly or yearly rule: ${entry}`);
  }
  if (nth === 0 || nth < -5 || nth > 5) throw new RecurrenceError(`Weekday position out of range: ${entry}`);
  return { weekday, nth };
}

/**
 * UNTIL as a calendar day. RFC 5545 writes it as a UTC instant
 * ("20261231T235959Z"); the time of day is dropped, because everything here is
 * a day and "until the 31st" is what the instant was standing in for.
 */
function parseUntil(value: string): IsoDate {
  const match = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(value);
  if (!match) throw new RecurrenceError(`Not a date: ${value}`);
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!isIsoDate(date)) throw new RecurrenceError(`Not a date: ${value}`);
  return date;
}

/** Back to an RRULE string, so what was parsed can be stored and re-read. */
export function formatRule(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.map((day) => `${day.nth ?? ""}${day.weekday}`).join(",")}`);
  }
  if (rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== null) parts.push(`UNTIL=${rule.until.replace(/-/g, "")}`);
  return parts.join(";");
}

const WEEKDAY_WORDS: Record<WeekdayCode, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth"];

/**
 * The rule as a sentence, for the admin form and the event page.
 *
 * Worth the code: "FREQ=MONTHLY;BYDAY=-1SA" is not something a church secretary
 * should have to read to check they typed the right thing, and "Every last
 * Saturday of the month" is something they can check at a glance.
 */
export function describeRule(rule: Recurrence, start?: IsoDate): string {
  const every = (unit: string, plural: string) =>
    rule.interval === 1 ? `Every ${unit}` : rule.interval === 2 ? `Every other ${unit}` : `Every ${rule.interval} ${plural}`;

  let sentence: string;
  switch (rule.freq) {
    case "DAILY":
      sentence = every("day", "days");
      break;
    case "WEEKLY": {
      const days = rule.byDay.length > 0 ? rule.byDay.map((day) => WEEKDAY_WORDS[day.weekday]) : start ? [weekdayWordOf(start)] : [];
      sentence =
        days.length === 0
          ? every("week", "weeks")
          : rule.interval === 1
            // "Every Tuesday", not "Every week on Tuesday" — the same fact,
            // said the way somebody would say it.
            ? `Every ${list(days)}`
            : `${every("week", "weeks")} on ${list(days)}`;
      break;
    }
    case "MONTHLY": {
      const when =
        rule.byDay.length > 0
          ? list(rule.byDay.map(nthWeekdayWord))
          : rule.byMonthDay.length > 0
            ? list(rule.byMonthDay.map(monthDayWord))
            : start
              ? monthDayWord(fromIsoDate(start).getUTCDate())
              : "";
      sentence = when === "" ? every("month", "months") : `${every("month", "months")} on ${when}`;
      break;
    }
    case "YEARLY":
      sentence = every("year", "years");
      break;
  }

  if (rule.count !== null) return `${sentence}, ${rule.count} time${rule.count === 1 ? "" : "s"}`;
  if (rule.until !== null) return `${sentence}, until ${rule.until}`;
  return sentence;
}

function weekdayWordOf(date: IsoDate): string {
  return WEEKDAY_WORDS[WEEKDAY_CODES[fromIsoDate(date).getUTCDay()]];
}

function nthWeekdayWord(day: ByDay): string {
  const word = WEEKDAY_WORDS[day.weekday];
  if (day.nth === null) return `every ${word}`;
  if (day.nth < 0) return `the ${day.nth === -1 ? "last" : `${ORDINALS[-day.nth]} from last`} ${word}`;
  return `the ${ORDINALS[day.nth]} ${word}`;
}

function monthDayWord(value: number): string {
  if (value < 0) return value === -1 ? "the last day" : `${-value} days from the end`;
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `the ${value}${suffix}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A hard ceiling on how many dates one rule may produce in a single call.
 *
 * "Every day, forever" asked for a hundred years is 36,525 rows, and something
 * has to say no. The cap is on the *answer*, so a caller asking for a year of a
 * daily event still gets all of it.
 */
export const MAX_OCCURRENCES = 750;

/**
 * The dates a rule lands on, within a window.
 *
 * `start` is the series' first date and is always the first occurrence — RFC
 * 5545's DTSTART, which counts even when it doesn't match the rule's own BYDAY.
 * That is not a quirk to work around: somebody who sets up "every Tuesday"
 * starting on a Thursday meant that Thursday too, and dropping it silently
 * moves their first meeting.
 *
 * `from`/`to` are the window to answer for, inclusive at both ends, so a
 * calendar can ask for the month it is drawing without expanding a decade.
 * COUNT is still counted from `start`, not from `from` — otherwise paging
 * forward through a "12 sessions" course would keep finding twelve more.
 */
export function occurrencesBetween(rule: Recurrence, start: IsoDate, from: IsoDate, to: IsoDate): IsoDate[] {
  if (compareIsoDates(from, to) > 0) return [];

  const found: IsoDate[] = [];
  let seen = 0;

  for (const date of walk(rule, start)) {
    if (rule.until !== null && compareIsoDates(date, rule.until) > 0) break;
    seen += 1;
    if (rule.count !== null && seen > rule.count) break;

    if (compareIsoDates(date, from) < 0) continue;
    if (compareIsoDates(date, to) > 0) break;

    found.push(date);
    if (found.length >= MAX_OCCURRENCES) break;
  }

  return found;
}

/**
 * Every date the rule lands on from `start` onwards, in order, lazily.
 *
 * Generator rather than an array because the caller nearly always wants a
 * window years after the start, and the stopping conditions (UNTIL, COUNT, the
 * window's far end) live with the caller. The one stopping condition here is
 * the empty-period guard below, which is about the rule being unsatisfiable
 * rather than about the answer being long enough.
 */
function* walk(rule: Recurrence, start: IsoDate): Generator<IsoDate> {
  if (!isIsoDate(start)) throw new RecurrenceError(`Not a date: ${start}`);
  yield start;

  // From period 0, not 1: with "Tuesdays and Thursdays" starting on a Tuesday,
  // period 0 is that same week — and skipping it would silently drop the very
  // first Thursday, which is the meeting two days away rather than a decade out.
  let period = -1;
  // A rule that matches nothing — "the 5th Sunday", "the 30th of February" —
  // would otherwise spin forever looking for a period that lands. Ten years of
  // empty periods is far past any real gap (the 5th Monday of a month comes
  // round within a year; Feb 29 within four) and short enough to fail fast.
  let empty = 0;
  const emptyLimit = rule.freq === "YEARLY" ? 10 : 120;

  while (empty < emptyLimit) {
    period += 1;
    const dates = datesInPeriod(rule, start, period).filter((date) => compareIsoDates(date, start) > 0);
    if (dates.length === 0) {
      empty += 1;
      continue;
    }
    empty = 0;
    for (const date of dates) yield date;
  }
}

/** The dates the rule lands on in its `period`th interval after the start. */
function datesInPeriod(rule: Recurrence, start: IsoDate, period: number): IsoDate[] {
  const step = period * rule.interval;

  if (rule.freq === "DAILY") return [addIsoDays(start, step)];

  if (rule.freq === "WEEKLY") {
    const anchor = addIsoDays(startOfWeek(start), step * 7);
    const weekdays = rule.byDay.length > 0 ? rule.byDay : [{ weekday: WEEKDAY_CODES[fromIsoDate(start).getUTCDay()], nth: null }];
    return weekdays
      .map((day) => addIsoDays(anchor, WEEKDAY_CODES.indexOf(day.weekday)))
      .sort(compareIsoDates);
  }

  const begin = fromIsoDate(start);
  const months = rule.freq === "MONTHLY" ? step : step * 12;
  const year = begin.getUTCFullYear() + Math.floor((begin.getUTCMonth() + months) / 12);
  const month = ((((begin.getUTCMonth() + months) % 12) + 12) % 12) + 1;

  if (rule.byDay.length > 0) {
    return rule.byDay
      .map((day) => nthWeekdayOf(year, month, day))
      .filter((date): date is IsoDate => date !== null)
      .sort(compareIsoDates);
  }

  const daysWanted = rule.byMonthDay.length > 0 ? rule.byMonthDay : [begin.getUTCDate()];
  const length = daysInMonth(year, month);
  return daysWanted
    .map((day) => (day > 0 ? day : length + day + 1))
    // A month that is too short simply doesn't have the date: the 31st skips
    // February rather than sliding to the 28th, which is what every calendar
    // application does and what "the 31st" means.
    .filter((day) => day >= 1 && day <= length)
    .map((day) => isoDateFromParts(year, month, day))
    .sort(compareIsoDates);
}

/** The Sunday on or before a date — the week's anchor, matching WEEKDAY_CODES. */
function startOfWeek(date: IsoDate): IsoDate {
  return addIsoDays(date, -fromIsoDate(date).getUTCDay());
}

export function daysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

/** The nth (or nth-from-last) given weekday of a month, or null if it has none. */
function nthWeekdayOf(year: number, month1Based: number, day: ByDay): IsoDate | null {
  const wanted = WEEKDAY_CODES.indexOf(day.weekday);
  const length = daysInMonth(year, month1Based);
  const firstWeekday = new Date(Date.UTC(year, month1Based - 1, 1)).getUTCDay();
  const firstMatch = 1 + ((wanted - firstWeekday + 7) % 7);

  if (day.nth === null) {
    // Unnumbered weekday in a monthly rule: the first one in the month. Every
    // one of them would make "every month on every Tuesday" mean a weekly rule
    // with extra steps, and nobody writing FREQ=MONTHLY means that.
    return isoDateFromParts(year, month1Based, firstMatch);
  }

  const date = day.nth > 0 ? firstMatch + (day.nth - 1) * 7 : lastMatch(length, firstMatch) + (day.nth + 1) * 7;
  return date >= 1 && date <= length ? isoDateFromParts(year, month1Based, date) : null;
}

function lastMatch(length: number, firstMatch: number): number {
  return firstMatch + Math.floor((length - firstMatch) / 7) * 7;
}

/**
 * A calendar day plus a wall-clock time in a named place, as an instant.
 *
 * This is the join between the two halves of the model: recurrence produces
 * days, an `Event` row stores an instant, and "Tuesdays at 19:30 in London" is
 * a different number of hours from UTC in July than in January. Getting this
 * wrong is not a rounding error — it moves a meeting by an hour twice a year,
 * in opposite directions.
 *
 * Done with `Intl` rather than a timezone library: the platform has had every
 * daylight-saving rule built in for years, and the only thing missing is the
 * inverse — going from a wall clock back to an instant. That inverse is the
 * function below.
 *
 * The two hours that don't behave:
 *
 *  - **The spring-forward gap.** 01:30 on the morning the clocks go forward
 *    never happens. Answering with 00:30 (what a naive correction gives) puts
 *    the meeting before the one people set. This returns the instant the wall
 *    clock reaches next — 02:30 — matching iCalendar and every calendar app.
 *  - **The autumn-back overlap.** 01:30 happens twice. This takes the first,
 *    which is the earlier instant, so a series doesn't quietly gain an hour.
 */
export function zonedInstant(date: IsoDate, time: string, timeZone: string): Date {
  const [hours, minutes] = parseClock(time);
  const day = fromIsoDate(date);
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);

  // The two offsets that can be in play: whatever the zone is a day either
  // side. Sampling both is what makes the awkward hours answerable at all —
  // asking the zone only at the wall clock itself cannot see the offset on the
  // far side of a transition, and so cannot tell an ambiguous hour from a
  // plain one.
  const before = offsetAt(timeZone, wall - DAY_MS);
  const after = offsetAt(timeZone, wall + DAY_MS);

  // A candidate is real when the instant it names actually shows the wall
  // clock we asked for.
  const real = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((instant) => offsetAt(timeZone, instant) === wall - instant);

  // Ambiguous: the hour happens twice. The earliest instant is the first of
  // them, so a weekly series doesn't quietly gain an hour on one October
  // morning.
  if (real.length > 0) return new Date(Math.min(...real));

  // A gap: this wall clock never happens. The smaller offset is the one after
  // the jump, so this is the instant the clock next reaches — 01:30 on the
  // morning it goes forward becomes 02:30, which is what every calendar does
  // and, more to the point, when people turn up.
  return new Date(wall - Math.min(before, after));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseClock(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) throw new RecurrenceError(`Not a time of day: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RecurrenceError(`Not a time of day: ${time}`);
  return [hours, minutes];
}

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * An unusable zone name is treated as UTC rather than throwing, the same
 * choice `dates.ts` makes for the same reason: one bad row of settings should
 * not stop a scheduled job doing everything else it was going to do.
 */
function offsetAt(timeZone: string, instant: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    return asUtc - Math.floor(instant / 1000) * 1000;
  } catch {
    return 0;
  }
}

/** Whether a string names a timezone this runtime knows. */
export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The local day a date lands on in a zone, for turning an instant back into a day. */
export function dayInZone(instant: Date, timeZone: string): IsoDate {
  return toIsoDate(new Date(instant.getTime() + offsetAt(timeZone, instant.getTime())));
}
