import type { Prisma } from "@prisma/client";
import { DatabaseScheduleProvider } from "@/lib/schedules/providers/database";
import { GoogleSheetsScheduleProvider } from "@/lib/schedules/providers/google-sheets";
import type { ScheduleProvider } from "@/lib/schedules/types";

/**
 * The single place that decides which provider backs a schedule.
 *
 * Adding a new data source means adding one case here plus a class that
 * implements `ScheduleProvider`. Nothing in the API layer, the sync engine or
 * the UI needs to change.
 */

export type ScheduleWithSource = Prisma.ScheduleGetPayload<{ include: { source: true } }>;

export function getProviderForSchedule(schedule: ScheduleWithSource): ScheduleProvider {
  if (schedule.sourceType === "GOOGLE_SHEETS") {
    return new GoogleSheetsScheduleProvider({
      spreadsheetId: schedule.source?.spreadsheetId,
      sheetName: schedule.source?.sheetName,
      range: schedule.source?.range,
      format: schedule.source?.format,
      parserConfig: schedule.source?.parserConfig,
    });
  }
  return new DatabaseScheduleProvider(schedule.id);
}

/** Human label for a source type, used across the admin UI. */
export function sourceTypeLabel(sourceType: string): string {
  return sourceType === "GOOGLE_SHEETS" ? "Google Sheets" : "Web managed";
}
