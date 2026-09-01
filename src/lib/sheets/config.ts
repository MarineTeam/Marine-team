import { z } from "zod";

/**
 * Validation for everything an admin can configure about a Google Sheets
 * schedule. Every value here originates from an HTTP request, so it is parsed
 * before it reaches the database and parsed *again* before the sync engine
 * reads it back -- a row edited directly in the database can never make the
 * parser misbehave.
 */

/**
 * A Google spreadsheet id as it appears in the URL:
 * https://docs.google.com/spreadsheets/d/<ID>/edit
 *
 * Restricting the character set is a real security control: it prevents path
 * traversal and query injection when the id is interpolated into the Sheets
 * API URL, so a configured schedule can only ever address a single sheet.
 */
export const spreadsheetIdSchema = z
  .string()
  .trim()
  .min(10, "Spreadsheet ID looks too short")
  .max(120, "Spreadsheet ID looks too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Spreadsheet ID may only contain letters, numbers, - and _");

/** Sheet/tab name. Quotes and apostrophes would break A1 range syntax. */
export const sheetNameSchema = z
  .string()
  .trim()
  .min(1, "Sheet name is required")
  .max(100, "Sheet name is too long")
  .regex(/^[^'"\\!]+$/, "Sheet name may not contain quotes, backslashes or !");

/** Optional A1 range within the sheet, e.g. "A1:F200" or "A:D". */
export const a1RangeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{1,3}\d{0,7}(:[A-Z]{1,3}\d{0,7})?$/i, "Range must look like A1:F200 or A:D")
  .max(32);

export const sheetFormatSchema = z.enum(["DATE_NAMES", "NAME_COLUMNS"]);
export type SheetFormat = z.infer<typeof sheetFormatSchema>;

/**
 * Column references accept either a letter ("B") or a header label ("Names").
 * Header labels are matched case-insensitively against the header row.
 */
const columnRefSchema = z.string().trim().min(1).max(64);

const MAX_TRUTHY_VALUES = 24;

/**
 * Parser tuning shared by both formats. Every field has a sensible default so
 * an admin can paste a spreadsheet id and get working output with no further
 * configuration; the rest exists for sheets that do not follow the happy path.
 */
export const parserConfigSchema = z
  .object({
    /**
     * 1-based row holding column headers. 0 means "no header row", in which
     * case columns must be referenced by letter.
     */
    headerRow: z.number().int().min(0).max(50).default(1),
    /** 1-based row where data begins. Defaults to `headerRow + 1`. */
    firstDataRow: z.number().int().min(1).max(1000).optional(),

    /** Column holding the date. Letter or header label. */
    dateColumn: columnRefSchema.default("A"),
    /** DATE_NAMES only: column holding the delimited list of names. */
    namesColumn: columnRefSchema.default("B"),
    /** Optional extra columns, by letter or header label. */
    titleColumn: columnRefSchema.optional(),
    notesColumn: columnRefSchema.optional(),
    locationColumn: columnRefSchema.optional(),
    timeColumn: columnRefSchema.optional(),

    /**
     * NAME_COLUMNS only: columns to ignore when treating every remaining
     * header as a person (e.g. "Notes", "Week", "Location").
     */
    ignoreColumns: z.array(columnRefSchema).max(64).default([]),

    /** Characters that separate names inside one cell. */
    nameSeparators: z
      .array(z.string().min(1).max(4))
      .max(12)
      .default([",", ";", "/", "&", "+", "\n"]),

    /** NAME_COLUMNS only: cell values that mean "this person is assigned". */
    truthyValues: z
      .array(z.string().min(1).max(16))
      .max(MAX_TRUTHY_VALUES)
      .default(["x", "yes", "y", "1", "true", "\u2713", "\u2714", "\u2611", "*"]),

    /**
     * Year to assume when a date cell omits it ("July 10"). When unset the
     * parser infers a year that keeps the sheet's dates in a sensible window
     * around today (see `inferYear`).
     */
    defaultYear: z.number().int().min(1970).max(2200).optional(),

    /** Interpret ambiguous numeric dates as D/M/Y rather than M/D/Y. */
    dayFirst: z.boolean().default(false),

    /** Rows whose date is more than this many days in the past are skipped. */
    maxPastDays: z.number().int().min(0).max(3650).default(400),
    /** Rows whose date is further ahead than this are skipped. */
    maxFutureDays: z.number().int().min(1).max(3650).default(730),

    /** Hard cap on rows read from one sheet. Bounds memory and API payloads. */
    maxRows: z.number().int().min(1).max(5000).default(2000),

    /** Title applied to every event that has no title column/value. */
    defaultTitle: z.string().trim().max(120).optional(),

    /** Skip rows that parse to a valid date but list nobody. */
    skipRowsWithoutPeople: z.boolean().default(true),
  })
  .strict();

export type ParserConfig = z.infer<typeof parserConfigSchema>;

/** Parse a stored `parserConfig` JSON blob, falling back to defaults. */
export function parseParserConfig(value: unknown): ParserConfig {
  const result = parserConfigSchema.safeParse(value ?? {});
  return result.success ? result.data : parserConfigSchema.parse({});
}

/** Full source configuration for a Google Sheets schedule. */
export const googleSheetsSourceSchema = z.object({
  spreadsheetId: spreadsheetIdSchema,
  sheetName: sheetNameSchema,
  range: a1RangeSchema.optional().nullable(),
  format: sheetFormatSchema,
  parserConfig: parserConfigSchema.default(parserConfigSchema.parse({})),
  syncIntervalMinutes: z.number().int().min(0).max(1440).default(60),
});

export type GoogleSheetsSourceConfig = z.infer<typeof googleSheetsSourceSchema>;

/**
 * Build the A1 notation the Sheets API expects. The sheet name is wrapped in
 * single quotes (the schema forbids quotes inside it) so names containing
 * spaces work.
 */
export function buildA1Range(sheetName: string, range?: string | null): string {
  const quoted = `'${sheetName}'`;
  return range ? `${quoted}!${range}` : quoted;
}

/**
 * Accept a full Google Sheets URL as well as a bare id, because that is what
 * an admin actually has in their clipboard.
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const candidate = urlMatch ? urlMatch[1] : trimmed;
  const parsed = spreadsheetIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
