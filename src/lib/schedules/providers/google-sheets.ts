import type {
  ProviderValidation,
  ScheduleProvider,
  SourceFetchResult,
} from "@/lib/schedules/types";
import {
  parseParserConfig,
  sheetFormatSchema,
  sheetNameSchema,
  spreadsheetIdSchema,
  type ParserConfig,
  type SheetFormat,
} from "@/lib/sheets/config";
import {
  fetchSheetValues,
  GoogleSheetsError,
  isGoogleSheetsConfigured,
} from "@/lib/sheets/client";
import { fingerprintEvents, parseSheet } from "@/lib/sheets/parse";

/**
 * Reads a schedule out of a Google Sheet.
 *
 * The provider owns exactly one job: produce `SourceEvent[]`. It does not
 * write to the database, resolve people, or know anything about how the app
 * displays a schedule. Swapping this schedule to web-managed later is a
 * one-column change because nothing downstream depends on this class.
 */
export class GoogleSheetsScheduleProvider implements ScheduleProvider {
  readonly type = "GOOGLE_SHEETS" as const;
  readonly label = "Google Sheets";

  private readonly spreadsheetId: string;
  private readonly sheetName: string;
  private readonly range: string | null;
  private readonly format: SheetFormat;
  private readonly config: ParserConfig;

  constructor(input: {
    spreadsheetId: string | null | undefined;
    sheetName: string | null | undefined;
    range?: string | null;
    format: string | null | undefined;
    parserConfig: unknown;
  }) {
    // Configuration is re-validated here rather than trusted from the
    // database, so a hand-edited row cannot reach the network layer.
    const spreadsheetId = spreadsheetIdSchema.safeParse(input.spreadsheetId ?? "");
    const sheetName = sheetNameSchema.safeParse(input.sheetName ?? "");
    const format = sheetFormatSchema.safeParse(input.format ?? "");

    if (!spreadsheetId.success) {
      throw new GoogleSheetsError(
        "This schedule has no valid spreadsheet ID configured",
        "not_found",
      );
    }
    if (!sheetName.success) {
      throw new GoogleSheetsError("This schedule has no valid sheet name configured", "sheet_not_found");
    }

    this.spreadsheetId = spreadsheetId.data;
    this.sheetName = sheetName.data;
    this.range = input.range ?? null;
    this.format = format.success ? format.data : "DATE_NAMES";
    this.config = parseParserConfig(input.parserConfig);
  }

  isAvailable(): boolean {
    return isGoogleSheetsConfigured();
  }

  async fetchEvents(): Promise<SourceFetchResult> {
    const grid = await fetchSheetValues({
      spreadsheetId: this.spreadsheetId,
      sheetName: this.sheetName,
      range: this.range,
    });

    const outcome = parseSheet(grid, { format: this.format, config: this.config });

    return {
      events: outcome.events,
      issues: outcome.issues,
      discoveredNames: outcome.discoveredNames,
      fingerprint: fingerprintEvents(outcome.events),
    };
  }

  async validate(): Promise<ProviderValidation> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        message:
          "Google Sheets is not configured on this server. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to enable it.",
      };
    }

    try {
      const result = await this.fetchEvents();
      const blocking = result.issues.filter(
        (issue) => issue.code === "missing_column" || issue.code === "empty_sheet",
      );
      return {
        ok: blocking.length === 0,
        message:
          blocking.length > 0
            ? blocking[0].message
            : `Read ${result.events.length} event${result.events.length === 1 ? "" : "s"} from "${this.sheetName}".`,
        preview: {
          rowCount: result.events.length,
          sampleEvents: result.events.slice(0, 5).map((event) => ({
            date: event.date,
            peopleNames: event.peopleNames,
            title: event.title ?? null,
          })),
          issues: result.issues.slice(0, 25),
        },
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof GoogleSheetsError
            ? error.message
            : "Could not read the spreadsheet. Check the configuration and try again.",
      };
    }
  }
}
