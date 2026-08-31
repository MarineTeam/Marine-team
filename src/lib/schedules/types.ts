/**
 * The normalized schedule/event model.
 *
 *      Google Sheet                Admin UI
 *           |                          |
 *  GoogleSheetsScheduleProvider   DatabaseScheduleProvider
 *           |                          |
 *           +----------> SourceEvent[] <+
 *                             |
 *                          (sync)
 *                             |
 *                        Postgres cache
 *                             |
 *                    Schedule[] / CalendarEvent[]
 *                             |
 *                            UI
 *
 * The UI consumes only `Schedule`, `CalendarEvent` and `Person`. Nothing above
 * the provider layer knows what a spreadsheet row looks like, which is what
 * lets an admin flip a schedule from Google Sheets to web-managed (or back)
 * without touching a single component.
 */

import type { IsoDate } from "@/lib/dates";

export const SOURCE_TYPES = ["WEB", "GOOGLE_SHEETS"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EVENT_STATUSES = ["CONFIRMED", "TENTATIVE", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const SYNC_STATUSES = ["NEVER", "RUNNING", "SUCCESS", "PARTIAL", "FAILED"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** A person as the UI knows them: a stable id plus a preferred spelling. */
export interface Person {
  id: string;
  displayName: string;
  /** Lowercased matching key. Exposed so the client can dedupe/sort reliably. */
  normalizedName: string;
}

/** A person's involvement in one event. */
export interface EventParticipant {
  personId: string;
  displayName: string;
  /** Optional role such as "Bread" or "Cup". */
  role: string | null;
}

/** A schedule as the UI knows it. Source details are deliberately absent. */
export interface Schedule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  enabled: boolean;
  displayOrder: number;
  /** Exposed for the admin UI and the "synced from a spreadsheet" hint only. */
  sourceType: SourceType;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
  updatedAt: string;
}

/** An event as the UI knows it. */
export interface CalendarEvent {
  id: string;
  scheduleId: string;
  /** Calendar day, `YYYY-MM-DD`. */
  date: IsoDate;
  endDate: IsoDate | null;
  allDay: boolean;
  /** `HH:mm`, null when `allDay`. */
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  notes: string | null;
  location: string | null;
  status: EventStatus;
  people: EventParticipant[];
  updatedAt: string;
}

/**
 * What a provider returns: an event that has been normalized but not yet
 * persisted. People are still raw display names here because a provider has no
 * business minting `Person` ids -- the sync engine resolves names to people.
 */
export interface SourceEvent {
  /**
   * Stable identity of this row within its source. Re-running a sync must
   * produce the same key for the same logical row so events update rather than
   * duplicate. For sheets this is derived from the date plus row position.
   */
  externalId: string;
  date: IsoDate;
  endDate?: IsoDate | null;
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  title?: string | null;
  notes?: string | null;
  location?: string | null;
  status?: EventStatus;
  /** Raw display names; resolved to `Person` ids during sync. */
  peopleNames: string[];
  /** Optional per-person role, keyed by the raw name. */
  roles?: Record<string, string>;
  /** 1-based row in the source document, for admin diagnostics. */
  sourceRow?: number | null;
}

/** A recoverable problem found while reading a source. */
export interface SourceIssue {
  /** 1-based row number, when the problem is row-scoped. */
  row?: number;
  column?: string;
  code:
    | "missing_date"
    | "invalid_date"
    | "missing_names"
    | "invalid_name"
    | "duplicate_row"
    | "missing_column"
    | "empty_sheet"
    | "row_too_wide"
    | "truncated";
  message: string;
}

/** The result of reading a source. Never throws for row-level problems. */
export interface SourceFetchResult {
  events: SourceEvent[];
  issues: SourceIssue[];
  /**
   * Fingerprint of the upstream payload. When it matches the previous sync the
   * engine skips the write phase entirely, which keeps Google API usage and
   * database churn down.
   */
  fingerprint: string;
  /** Names discovered in the source, whether or not they appear in an event. */
  discoveredNames: string[];
}

/**
 * The one interface every data source implements.
 *
 * Providers are read-only and stateless: they turn "wherever this schedule's
 * data lives" into `SourceEvent[]`. Persistence, person resolution and
 * conflict handling all happen in the sync engine, so adding a new source
 * (iCal, Airtable, a CSV upload) means implementing this and nothing else.
 */
export interface ScheduleProvider {
  readonly type: SourceType;
  /** Human-readable label for the admin UI. */
  readonly label: string;
  /** False when the deployment lacks the credentials this provider needs. */
  isAvailable(): boolean;
  /** Cheap connectivity/permission check used by the admin "Test" button. */
  validate(): Promise<ProviderValidation>;
  fetchEvents(): Promise<SourceFetchResult>;
}

export interface ProviderValidation {
  ok: boolean;
  message: string;
  /** Sample of what the parser found, so an admin can confirm the mapping. */
  preview?: {
    rowCount: number;
    sampleEvents: Array<Pick<SourceEvent, "date" | "peopleNames" | "title">>;
    issues: SourceIssue[];
  };
}

/** Outcome of one sync run, surfaced in the admin UI and the audit log. */
export interface SyncResult {
  scheduleId: string;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string;
  created: number;
  updated: number;
  deleted: number;
  unchanged: boolean;
  peopleCreated: number;
  issues: SourceIssue[];
  error: string | null;
}
