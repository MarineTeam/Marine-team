/**
 * Turning a grid of spreadsheet cells into `SourceEvent[]`.
 *
 * Two layouts are supported and both are driven by configuration rather than
 * hard-coded column positions:
 *
 *   DATE_NAMES                    NAME_COLUMNS
 *   Date     | Names              Date     | Devin | Cindy | John
 *   July 10  | Devin, Cindy       July 10  |   x   |   x   |
 *   July 17  | John               July 17  |       |   x   |  x
 *
 * Adding a third layout means adding a branch here and an enum value -- no
 * other layer of the app changes.
 *
 * Everything in this module is pure: it takes cells in and returns events and
 * issues out. That is what makes the format handling straightforward to test
 * against the ugly real-world sheets it has to survive.
 */

import { compareIsoDates, isoDayDifference, todayIso, type IsoDate } from "@/lib/dates";
import { isPlausibleName, normalizeName, splitNames, toDisplayName } from "@/lib/names";
import type { SourceEvent, SourceIssue } from "@/lib/schedules/types";
import type { ParserConfig, SheetFormat } from "@/lib/sheets/config";
import { parseSheetDate, parseSheetTime } from "@/lib/sheets/dates";

/** A raw grid exactly as the Sheets API returns it: rows of loosely typed cells. */
export type SheetGrid = ReadonlyArray<ReadonlyArray<unknown>>;

export interface ParseOptions {
  format: SheetFormat;
  config: ParserConfig;
  /** Overridable for deterministic tests. */
  referenceDate?: Date;
}

export interface ParseOutcome {
  events: SourceEvent[];
  issues: SourceIssue[];
  /** Every name seen anywhere in the sheet, including unassigned columns. */
  discoveredNames: string[];
}

const MAX_TEXT_LENGTH = 500;

/**
 * Column headers that are never a person, in the NAME_COLUMNS layout.
 *
 * Without this, a perfectly ordinary sheet with a "Notes" column produces a
 * person called "Notes" who is on every event that has a note. These are the
 * labels real rota spreadsheets use for their non-person columns; an admin can
 * add more via `ignoreColumns`, and none of these is a plausible name.
 *
 * Deliberately excludes month names, since "May" and "June" are also names.
 */
const NEVER_A_PERSON = new Set([
  "date",
  "day",
  "days",
  "week",
  "wk",
  "weekday",
  "month",
  "year",
  "time",
  "start",
  "end",
  "title",
  "event",
  "description",
  "desc",
  "detail",
  "details",
  "note",
  "notes",
  "comment",
  "comments",
  "remark",
  "remarks",
  "location",
  "place",
  "venue",
  "room",
  "status",
  "no",
  "num",
  "number",
  "count",
  "total",
  "id",
  "ref",
  "n/a",
  "na",
  "tbd",
  "misc",
  "other",
]);

/** Coerce any cell to a trimmed string; nulls and objects become "". */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Cap free text so a pathological cell cannot bloat the database. */
function clampText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_TEXT_LENGTH ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed;
}

/** "A" -> 0, "B" -> 1, "AA" -> 26. Returns null for non-letter input. */
export function columnLetterToIndex(letter: string): number | null {
  const trimmed = letter.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(trimmed)) return null;
  let index = 0;
  for (const character of trimmed) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Resolve a configured column reference to a zero-based index.
 *
 * A reference is tried as a header label first (case- and space-insensitive),
 * then as a column letter. Header labels win because "B" is a legitimate
 * header in a sheet whose columns are named after people.
 */
export function resolveColumn(
  reference: string,
  headers: readonly string[],
): number | null {
  const wanted = normalizeName(reference);
  if (wanted) {
    const headerIndex = headers.findIndex((header) => normalizeName(header) === wanted);
    if (headerIndex >= 0) return headerIndex;
  }
  return columnLetterToIndex(reference);
}

function truthyMatcher(config: ParserConfig): (value: string) => boolean {
  const accepted = new Set(config.truthyValues.map((entry) => entry.trim().toLowerCase()));
  return (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (accepted.has(normalized)) return true;
    // Any non-empty, non-negative marker counts. Sheets are inconsistent and a
    // cell containing "Bread" against a person's column clearly means yes.
    return !["no", "n", "0", "false", "-", "--", "n/a", "na"].includes(normalized);
  };
}

/**
 * The externalId must be stable across syncs so the same logical row updates
 * instead of duplicating, and unique within the schedule.
 *
 * Date alone is not enough (a schedule can have two events on one day), and
 * row index alone is not enough (inserting a row above would re-key everything
 * below it). Date plus an occurrence counter for that date is stable under row
 * insertion and unique per day.
 */
function buildExternalId(date: IsoDate, occurrence: number): string {
  return occurrence === 0 ? `row:${date}` : `row:${date}#${occurrence}`;
}

interface RowContext {
  rowNumber: number;
  issues: SourceIssue[];
  config: ParserConfig;
  referenceDate: Date;
}

/** Shared date handling for both formats. Pushes an issue and returns null on failure. */
function readDate(cell: unknown, context: RowContext): IsoDate | null {
  const { config, rowNumber, issues } = context;
  const text = cellText(cell);
  if (!text && typeof cell !== "number") {
    return null; // Blank row; the caller decides whether that is an issue.
  }

  const parsed = parseSheetDate(typeof cell === "number" ? cell : text, {
    defaultYear: config.defaultYear,
    dayFirst: config.dayFirst,
    referenceDate: context.referenceDate,
  });

  if (!parsed.ok) {
    if (parsed.reason !== "empty") {
      issues.push({
        row: rowNumber,
        column: "date",
        code: parsed.reason === "out_of_range" ? "invalid_date" : "invalid_date",
        message: `Could not read "${text}" as a date`,
      });
    }
    return null;
  }

  const today = todayIso(undefined, context.referenceDate);
  const offset = isoDayDifference(today, parsed.date);
  if (offset < -config.maxPastDays || offset > config.maxFutureDays) {
    issues.push({
      row: rowNumber,
      column: "date",
      code: "invalid_date",
      message: `Date ${parsed.date} is outside the configured import window`,
    });
    return null;
  }

  return parsed.date;
}

export function parseSheet(grid: SheetGrid, options: ParseOptions): ParseOutcome {
  const { format, config } = options;
  const referenceDate = options.referenceDate ?? new Date();
  const issues: SourceIssue[] = [];

  if (grid.length === 0) {
    issues.push({ code: "empty_sheet", message: "The sheet returned no rows" });
    return { events: [], issues, discoveredNames: [] };
  }

  const headerRowIndex = config.headerRow > 0 ? config.headerRow - 1 : -1;
  const headers =
    headerRowIndex >= 0 && headerRowIndex < grid.length
      ? (grid[headerRowIndex] ?? []).map(cellText)
      : [];

  const firstDataRowIndex =
    (config.firstDataRow ?? (config.headerRow > 0 ? config.headerRow + 1 : 1)) - 1;

  const rows = grid.slice(Math.max(0, firstDataRowIndex));
  if (rows.length > config.maxRows) {
    issues.push({
      code: "truncated",
      message: `Sheet has more than ${config.maxRows} data rows; only the first ${config.maxRows} were imported`,
    });
  }
  const boundedRows = rows.slice(0, config.maxRows);

  const shared = {
    rows: boundedRows,
    firstDataRowIndex: Math.max(0, firstDataRowIndex),
    headers,
    config,
    issues,
    referenceDate,
  };

  return format === "NAME_COLUMNS" ? parseNameColumns(shared) : parseDateNames(shared);
}

interface FormatArgs {
  rows: SheetGrid;
  firstDataRowIndex: number;
  headers: string[];
  config: ParserConfig;
  issues: SourceIssue[];
  referenceDate: Date;
}

// ---------------------------------------------------------------------------
// Format: Date | Names
// ---------------------------------------------------------------------------

function parseDateNames(args: FormatArgs): ParseOutcome {
  const { rows, firstDataRowIndex, headers, config, issues, referenceDate } = args;

  const dateIndex = resolveColumn(config.dateColumn, headers);
  const namesIndex = resolveColumn(config.namesColumn, headers);

  if (dateIndex === null) {
    issues.push({
      code: "missing_column",
      column: config.dateColumn,
      message: `Date column "${config.dateColumn}" was not found in the sheet`,
    });
    return { events: [], issues, discoveredNames: [] };
  }
  if (namesIndex === null) {
    issues.push({
      code: "missing_column",
      column: config.namesColumn,
      message: `Names column "${config.namesColumn}" was not found in the sheet`,
    });
    return { events: [], issues, discoveredNames: [] };
  }

  const titleIndex = config.titleColumn ? resolveColumn(config.titleColumn, headers) : null;
  const notesIndex = config.notesColumn ? resolveColumn(config.notesColumn, headers) : null;
  const locationIndex = config.locationColumn
    ? resolveColumn(config.locationColumn, headers)
    : null;
  const timeIndex = config.timeColumn ? resolveColumn(config.timeColumn, headers) : null;

  const events: SourceEvent[] = [];
  const discovered = new Map<string, string>();
  const occurrencesByDate = new Map<IsoDate, number>();

  rows.forEach((row, offset) => {
    const rowNumber = firstDataRowIndex + offset + 1;
    const context: RowContext = { rowNumber, issues, config, referenceDate };

    const isBlank = row.every((cell) => cellText(cell) === "");
    if (isBlank) return;

    const date = readDate(row[dateIndex], context);
    if (!date) {
      if (cellText(row[dateIndex]) === "" && row.some((cell) => cellText(cell) !== "")) {
        issues.push({
          row: rowNumber,
          column: "date",
          code: "missing_date",
          message: "Row has content but no date",
        });
      }
      return;
    }

    const names = collectNames(cellText(row[namesIndex]), config, rowNumber, issues, discovered);
    if (names.length === 0 && config.skipRowsWithoutPeople) {
      issues.push({
        row: rowNumber,
        code: "missing_names",
        message: `No names listed for ${date}`,
      });
      return;
    }

    const occurrence = occurrencesByDate.get(date) ?? 0;
    occurrencesByDate.set(date, occurrence + 1);

    events.push({
      externalId: buildExternalId(date, occurrence),
      date,
      allDay: timeIndex === null || !parseSheetTime(cellText(row[timeIndex])),
      startTime: timeIndex === null ? null : parseSheetTime(cellText(row[timeIndex])),
      endTime: null,
      title:
        (titleIndex !== null ? clampText(cellText(row[titleIndex])) : null) ??
        config.defaultTitle ??
        null,
      notes: notesIndex !== null ? clampText(cellText(row[notesIndex])) : null,
      location: locationIndex !== null ? clampText(cellText(row[locationIndex])) : null,
      status: "CONFIRMED",
      peopleNames: names,
      sourceRow: rowNumber,
    });
  });

  return finalize(events, issues, discovered);
}

// ---------------------------------------------------------------------------
// Format: Date | Devin | Cindy | John | ...
// ---------------------------------------------------------------------------

function parseNameColumns(args: FormatArgs): ParseOutcome {
  const { rows, firstDataRowIndex, headers, config, issues, referenceDate } = args;

  if (headers.length === 0) {
    issues.push({
      code: "missing_column",
      message:
        "The name-columns format needs a header row containing each person's name. Set the header row in the parser settings.",
    });
    return { events: [], issues, discoveredNames: [] };
  }

  const dateIndex = resolveColumn(config.dateColumn, headers);
  if (dateIndex === null) {
    issues.push({
      code: "missing_column",
      column: config.dateColumn,
      message: `Date column "${config.dateColumn}" was not found in the sheet`,
    });
    return { events: [], issues, discoveredNames: [] };
  }

  const titleIndex = config.titleColumn ? resolveColumn(config.titleColumn, headers) : null;
  const notesIndex = config.notesColumn ? resolveColumn(config.notesColumn, headers) : null;
  const locationIndex = config.locationColumn
    ? resolveColumn(config.locationColumn, headers)
    : null;
  const timeIndex = config.timeColumn ? resolveColumn(config.timeColumn, headers) : null;

  // Every column that is not the date, an explicitly mapped column, or on the
  // ignore list is treated as a person.
  const reserved = new Set<number>([dateIndex]);
  for (const index of [titleIndex, notesIndex, locationIndex, timeIndex]) {
    if (index !== null) reserved.add(index);
  }
  for (const reference of config.ignoreColumns) {
    const index = resolveColumn(reference, headers);
    if (index !== null) reserved.add(index);
  }

  /** Column index -> display name, deduped so two "Devin" columns merge. */
  const personColumns: Array<{ index: number; displayName: string }> = [];
  const seenNormalized = new Map<string, number>();
  headers.forEach((header, index) => {
    if (reserved.has(index)) return;
    const raw = header.trim();
    if (!raw) return;
    // Skip the obvious non-person columns silently: they are expected in a
    // real sheet, so reporting them every sync would be noise, not signal.
    if (NEVER_A_PERSON.has(normalizeName(raw))) return;
    if (!isPlausibleName(raw)) {
      issues.push({
        code: "invalid_name",
        column: raw,
        message: `Column header "${raw}" is not usable as a person's name and was ignored`,
      });
      return;
    }
    const displayName = toDisplayName(raw);
    const key = normalizeName(displayName);
    if (seenNormalized.has(key)) {
      issues.push({
        code: "duplicate_row",
        column: raw,
        message: `Duplicate person column "${raw}"; the first one is used`,
      });
      return;
    }
    seenNormalized.set(key, index);
    personColumns.push({ index, displayName });
  });

  if (personColumns.length === 0) {
    issues.push({
      code: "missing_column",
      message: "No person columns were found in the header row",
    });
  }

  const isTruthy = truthyMatcher(config);
  const events: SourceEvent[] = [];
  const discovered = new Map<string, string>();
  for (const column of personColumns) {
    discovered.set(normalizeName(column.displayName), column.displayName);
  }
  const occurrencesByDate = new Map<IsoDate, number>();

  rows.forEach((row, offset) => {
    const rowNumber = firstDataRowIndex + offset + 1;
    const context: RowContext = { rowNumber, issues, config, referenceDate };

    const isBlank = row.every((cell) => cellText(cell) === "");
    if (isBlank) return;

    const date = readDate(row[dateIndex], context);
    if (!date) {
      if (cellText(row[dateIndex]) === "" && row.some((cell) => cellText(cell) !== "")) {
        issues.push({
          row: rowNumber,
          column: "date",
          code: "missing_date",
          message: "Row has content but no date",
        });
      }
      return;
    }

    const names: string[] = [];
    const roles: Record<string, string> = {};
    for (const column of personColumns) {
      const cell = cellText(row[column.index]);
      if (!isTruthy(cell)) continue;
      names.push(column.displayName);
      // A cell containing text rather than a tick doubles as a role label.
      const marker = cell.trim();
      if (marker && !config.truthyValues.some((value) => value.toLowerCase() === marker.toLowerCase())) {
        const role = clampText(marker);
        if (role && role.length <= 60) roles[column.displayName] = role;
      }
    }

    if (names.length === 0 && config.skipRowsWithoutPeople) {
      issues.push({
        row: rowNumber,
        code: "missing_names",
        message: `No one is marked for ${date}`,
      });
      return;
    }

    const occurrence = occurrencesByDate.get(date) ?? 0;
    occurrencesByDate.set(date, occurrence + 1);

    events.push({
      externalId: buildExternalId(date, occurrence),
      date,
      allDay: timeIndex === null || !parseSheetTime(cellText(row[timeIndex])),
      startTime: timeIndex === null ? null : parseSheetTime(cellText(row[timeIndex])),
      endTime: null,
      title:
        (titleIndex !== null ? clampText(cellText(row[titleIndex])) : null) ??
        config.defaultTitle ??
        null,
      notes: notesIndex !== null ? clampText(cellText(row[notesIndex])) : null,
      location: locationIndex !== null ? clampText(cellText(row[locationIndex])) : null,
      status: "CONFIRMED",
      peopleNames: names,
      roles: Object.keys(roles).length > 0 ? roles : undefined,
      sourceRow: rowNumber,
    });
  });

  return finalize(events, issues, discovered);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function collectNames(
  cell: string,
  config: ParserConfig,
  rowNumber: number,
  issues: SourceIssue[],
  discovered: Map<string, string>,
): string[] {
  const candidates = splitNames(cell, config.nameSeparators);
  const names: string[] = [];
  for (const candidate of candidates) {
    if (!isPlausibleName(candidate)) {
      issues.push({
        row: rowNumber,
        code: "invalid_name",
        message: `Ignored "${candidate}" -- it does not look like a name`,
      });
      continue;
    }
    const display = toDisplayName(candidate);
    names.push(display);
    discovered.set(normalizeName(display), display);
  }
  return names;
}

function finalize(
  events: SourceEvent[],
  issues: SourceIssue[],
  discovered: Map<string, string>,
): ParseOutcome {
  events.sort((a, b) => compareIsoDates(a.date, b.date));
  return {
    events,
    issues,
    discoveredNames: [...discovered.values()].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Stable fingerprint of a parse result. Two syncs that would write identical
 * data produce the same string, letting the sync engine skip the write phase.
 */
export function fingerprintEvents(events: readonly SourceEvent[]): string {
  const canonical = events
    .map((event) =>
      [
        event.externalId,
        event.date,
        event.title ?? "",
        event.notes ?? "",
        event.location ?? "",
        event.startTime ?? "",
        event.status ?? "CONFIRMED",
        [...event.peopleNames].map(normalizeName).sort().join("|"),
      ].join(""),
    )
    .sort()
    .join("");

  // FNV-1a: short, dependency-free, and collision-resistant enough to decide
  // "did anything change?".
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${events.length}`;
}
