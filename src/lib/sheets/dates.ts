/**
 * Parsing dates out of spreadsheet cells.
 *
 * Google Sheets hands back whatever the person typed. Real church schedules
 * contain "July 10", "7/10", "2026-07-10", "Sun Jul 10", "10 July 2026",
 * "July 10th" and -- when the cell is formatted as a date -- a bare serial
 * number. All of those must land on the same calendar day, and anything that
 * is not a date must be rejected rather than silently guessed at.
 *
 * This module is pure and has no dependency on the database or the network.
 */

import { isoDateFromParts, isIsoDate, type IsoDate } from "@/lib/dates";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  febr: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAY_PREFIX =
  /^(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(day|nesday|rsday|urday|day)?[\s,.-]+/i;

/** Ordinal suffixes: "10th", "1st", "22nd", "3rd". */
const ORDINAL_SUFFIX = /(\d+)(st|nd|rd|th)\b/gi;

export interface DateParseOptions {
  /** Year to assume when the cell omits one. */
  defaultYear?: number;
  /** Treat "3/4" as 3 April rather than 4 March. */
  dayFirst?: boolean;
  /** Anchor for year inference and for validating "not absurdly far away". */
  referenceDate?: Date;
}

export type DateParseResult =
  | { ok: true; date: IsoDate }
  | { ok: false; reason: "empty" | "unrecognized" | "out_of_range" };

/**
 * Google's serial date epoch is 1899-12-30. Values below ~20000 (1954) or
 * above ~80000 (2119) are far more likely to be a stray number than a date, so
 * they are rejected.
 */
const SERIAL_MIN = 20_000;
const SERIAL_MAX = 80_000;
const SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function fromSerial(serial: number): IsoDate {
  const millis = SERIAL_EPOCH_UTC + Math.floor(serial) * 86_400_000;
  const date = new Date(millis);
  return isoDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * How much more heavily a past date is penalised than a future one.
 *
 * With a factor of 1.5 the crossover sits at 365 / (1.5 + 1) ~= 146 days: a
 * bare "March 4" read in June stays in the current year (the sheet still has
 * the earlier weeks of this year's rota on it), while a bare "January 5" read
 * in June rolls forward to next January (nobody is scheduling six months into
 * the past). Both are the reading a person would give.
 */
const PAST_PENALTY = 1.5;

/**
 * Choose a year for a date that did not specify one.
 *
 * Picks the candidate year (previous, current, next) whose resulting date sits
 * closest to today, biased forward -- schedules are mostly about the future.
 */
export function inferYear(month: number, day: number, reference: Date): number {
  const referenceYear = reference.getFullYear();
  const referenceTime = Date.UTC(
    referenceYear,
    reference.getMonth(),
    reference.getDate(),
  );

  let bestYear = referenceYear;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const year of [referenceYear - 1, referenceYear, referenceYear + 1]) {
    const candidate = Date.UTC(year, month - 1, day);
    const deltaDays = (candidate - referenceTime) / 86_400_000;
    const score = deltaDays >= 0 ? deltaDays : -deltaDays * PAST_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      bestYear = year;
    }
  }
  return bestYear;
}

function normalizeTwoDigitYear(year: number): number {
  if (year >= 100) return year;
  // 00-69 -> 2000s, 70-99 -> 1900s, matching the POSIX convention.
  return year < 70 ? 2000 + year : 1900 + year;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Parse one spreadsheet cell into a calendar day.
 *
 * Returns a discriminated result rather than throwing, because a single bad
 * row must never abort an import of two hundred good ones.
 */
export function parseSheetDate(
  raw: unknown,
  options: DateParseOptions = {},
): DateParseResult {
  const reference = options.referenceDate ?? new Date();

  // --- numeric serial (a cell formatted as a date) ---
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < SERIAL_MIN || raw > SERIAL_MAX) return { ok: false, reason: "out_of_range" };
    return { ok: true, date: fromSerial(raw) };
  }

  if (typeof raw !== "string") return { ok: false, reason: "empty" };

  let text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > 64) return { ok: false, reason: "unrecognized" };

  // A serial number that arrived as a string.
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= SERIAL_MIN && serial <= SERIAL_MAX) {
      return { ok: true, date: fromSerial(serial) };
    }
  }

  // Drop a leading weekday and any ordinal suffixes.
  text = text.replace(WEEKDAY_PREFIX, "").replace(ORDINAL_SUFFIX, "$1").trim();
  // Collapse separators and strip a trailing period ("Jul. 10.").
  text = text.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  if (!text) return { ok: false, reason: "unrecognized" };

  // --- ISO: 2026-07-10 (also accepts 2026/07/10) ---
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso.map(Number);
    return finish(year, month, day, reference);
  }

  // --- "July 10" / "Jul. 10" / "Jul 10, 2026" / "July 10 2026" ---
  // The optional period covers abbreviations written "Jul." or "Sept.".
  const monthFirst = text.match(/^(\p{L}+)\.?\s+(\d{1,2})(?:\s*,?\s*(\d{2,4}))?$/u);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (month) {
      const day = Number(monthFirst[2]);
      const year = monthFirst[3]
        ? normalizeTwoDigitYear(Number(monthFirst[3]))
        : options.defaultYear ?? inferYear(month, day, reference);
      return finish(year, month, day, reference);
    }
  }

  // --- "10 July" / "10 Jul." / "10 July 2026" ---
  const dayFirstWord = text.match(/^(\d{1,2})\s+(\p{L}+)\.?(?:\s*,?\s*(\d{2,4}))?$/u);
  if (dayFirstWord) {
    const month = MONTHS[dayFirstWord[2].toLowerCase()];
    if (month) {
      const day = Number(dayFirstWord[1]);
      const year = dayFirstWord[3]
        ? normalizeTwoDigitYear(Number(dayFirstWord[3]))
        : options.defaultYear ?? inferYear(month, day, reference);
      return finish(year, month, day, reference);
    }
  }

  // --- numeric: 7/10, 7-10-2026, 10.7.26 ---
  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    let month: number;
    let day: number;
    if (options.dayFirst) {
      day = first;
      month = second;
    } else if (first > 12 && second <= 12) {
      // Unambiguous D/M even though the sheet is configured M/D.
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
    const year = numeric[3]
      ? normalizeTwoDigitYear(Number(numeric[3]))
      : options.defaultYear ?? inferYear(month, day, reference);
    return finish(year, month, day, reference);
  }

  return { ok: false, reason: "unrecognized" };
}

function finish(
  year: number,
  month: number,
  day: number,
  reference: Date,
): DateParseResult {
  if (!isRealDate(year, month, day)) return { ok: false, reason: "unrecognized" };
  // Guard against typos like "2062" producing events decades away.
  const referenceYear = reference.getFullYear();
  if (year < referenceYear - 20 || year > referenceYear + 20) {
    return { ok: false, reason: "out_of_range" };
  }
  const date = isoDateFromParts(year, month, day);
  return isIsoDate(date) ? { ok: true, date } : { ok: false, reason: "unrecognized" };
}

/** Parse an optional "HH:mm" / "7:30 PM" / "7pm" time cell. */
export function parseSheetTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
