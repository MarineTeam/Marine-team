import { fromIsoDate } from "@/lib/dates";
import { normalizeName } from "@/lib/names";
import { prisma } from "@/lib/db";
import { resolvePeople } from "@/lib/schedules/people";
import { getProviderForSchedule, type ScheduleWithSource } from "@/lib/schedules/provider";
import type { SourceEvent, SourceIssue, SyncResult } from "@/lib/schedules/types";
import { GoogleSheetsError } from "@/lib/sheets/client";
import { logAudit } from "@/lib/audit";

/**
 * The sync engine: provider output in, database rows out.
 *
 * Guarantees that matter operationally:
 *
 *  - **Never destructive on failure.** If the provider throws (Google down,
 *    bad credentials, network blip) the previously imported events are left
 *    exactly as they were. A temporary outage must not empty everyone's
 *    calendar.
 *  - **Idempotent.** Rows are matched on `externalId`, so re-running a sync
 *    updates in place instead of duplicating.
 *  - **Respects hand-made events.** Only rows with `origin = GOOGLE_SHEETS`
 *    are ever removed by a sheet sync; anything an admin added by hand to the
 *    same schedule survives.
 *  - **Cheap when nothing changed.** A fingerprint comparison short-circuits
 *    the entire write phase, which keeps both Google API quota and database
 *    churn down.
 */

/** Rows deleted from the sheet are soft-deleted so clients can drop them too. */
const SOFT_DELETE_ONLY = true;

export interface SyncOptions {
  /** Ignore the fingerprint and rewrite everything. */
  force?: boolean;
  /** Recorded in the audit log. */
  actorEmail?: string;
}

export async function syncSchedule(
  scheduleId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const startedAt = new Date();

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    include: { source: true },
  });

  if (!schedule) {
    return failure(scheduleId, startedAt, "Schedule not found");
  }

  // Web-managed schedules are already authoritative; there is nothing to pull.
  if (schedule.sourceType === "WEB") {
    const finishedAt = new Date();
    return {
      scheduleId,
      status: "SUCCESS",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: true,
      peopleCreated: 0,
      issues: [],
      error: null,
    };
  }

  await markRunning(schedule);

  let provider;
  try {
    provider = getProviderForSchedule(schedule);
  } catch (error) {
    const message = describeError(error);
    await markFailed(schedule, message);
    return failure(scheduleId, startedAt, message);
  }

  if (!provider.isAvailable()) {
    const message =
      "Google Sheets is not configured on this server, so this schedule cannot sync.";
    await markFailed(schedule, message);
    return failure(scheduleId, startedAt, message);
  }

  let fetched;
  try {
    fetched = await provider.fetchEvents();
  } catch (error) {
    const message = describeError(error);
    // Deliberately no deletion here: cached events stay put through an outage.
    await markFailed(schedule, message);
    return failure(scheduleId, startedAt, message);
  }

  const unchanged =
    !options.force &&
    schedule.source?.lastSyncHash !== null &&
    schedule.source?.lastSyncHash === fetched.fingerprint;

  if (unchanged) {
    await prisma.scheduleSource.update({
      where: { scheduleId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: fetched.issues.length > 0 ? "PARTIAL" : "SUCCESS",
        lastSyncError: null,
      },
    });
    const finishedAt = new Date();
    return {
      scheduleId,
      status: fetched.issues.length > 0 ? "PARTIAL" : "SUCCESS",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: true,
      peopleCreated: 0,
      issues: fetched.issues,
      error: null,
    };
  }

  const applied = await applyEvents(schedule, fetched.events, fetched.discoveredNames);

  const status: SyncResult["status"] = fetched.issues.length > 0 ? "PARTIAL" : "SUCCESS";

  await prisma.scheduleSource.update({
    where: { scheduleId },
    data: {
      lastSyncedAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: null,
      lastSyncHash: fetched.fingerprint,
    },
  });

  await recordAudit(options.actorEmail, "schedule.sync", scheduleId, {
    created: applied.created,
    updated: applied.updated,
    deleted: applied.deleted,
    issues: fetched.issues.length,
  });

  const finishedAt = new Date();
  return {
    scheduleId,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    created: applied.created,
    updated: applied.updated,
    deleted: applied.deleted,
    unchanged: false,
    peopleCreated: applied.peopleCreated,
    issues: fetched.issues,
    error: null,
  };
}

interface ApplyResult {
  created: number;
  updated: number;
  deleted: number;
  peopleCreated: number;
}

/**
 * Write one provider's events into the database inside a single transaction,
 * so a mid-sync crash cannot leave a half-imported schedule.
 */
async function applyEvents(
  schedule: ScheduleWithSource,
  sourceEvents: readonly SourceEvent[],
  discoveredNames: readonly string[],
): Promise<ApplyResult> {
  const allNames = new Set<string>(discoveredNames);
  for (const event of sourceEvents) {
    for (const name of event.peopleNames) allNames.add(name);
  }

  return prisma.$transaction(
    async (tx) => {
      const people = await resolvePeople([...allNames], tx);

      const existing = await tx.calendarEvent.findMany({
        where: { scheduleId: schedule.id, origin: "GOOGLE_SHEETS" },
        select: { id: true, externalId: true, deletedAt: true },
      });
      const existingByExternalId = new Map(
        existing
          .filter((row): row is typeof row & { externalId: string } => row.externalId !== null)
          .map((row) => [row.externalId, row]),
      );

      let created = 0;
      let updated = 0;
      const seen = new Set<string>();

      for (const sourceEvent of sourceEvents) {
        seen.add(sourceEvent.externalId);

        const participantIds: Array<{ personId: string; role: string | null }> = [];
        const usedPersonIds = new Set<string>();
        for (const name of sourceEvent.peopleNames) {
          const personId = people.idByNormalizedName.get(normalizeName(name));
          if (!personId || usedPersonIds.has(personId)) continue;
          usedPersonIds.add(personId);
          participantIds.push({ personId, role: sourceEvent.roles?.[name] ?? null });
        }

        const data = {
          date: fromIsoDate(sourceEvent.date),
          endDate: sourceEvent.endDate ? fromIsoDate(sourceEvent.endDate) : null,
          allDay: sourceEvent.allDay ?? true,
          startTime: sourceEvent.startTime ?? null,
          endTime: sourceEvent.endTime ?? null,
          title: sourceEvent.title ?? null,
          notes: sourceEvent.notes ?? null,
          location: sourceEvent.location ?? null,
          status: sourceEvent.status ?? ("CONFIRMED" as const),
          sourceRow: sourceEvent.sourceRow ?? null,
          origin: "GOOGLE_SHEETS" as const,
          // Undo a previous soft delete if the row came back.
          deletedAt: null,
        };

        const match = existingByExternalId.get(sourceEvent.externalId);
        if (match) {
          await tx.calendarEvent.update({ where: { id: match.id }, data });
          // Replacing the participant set is simpler and safer than diffing,
          // and these sets are tiny (a handful of people per event).
          await tx.calendarEventPerson.deleteMany({ where: { eventId: match.id } });
          if (participantIds.length > 0) {
            await tx.calendarEventPerson.createMany({
              data: participantIds.map((participant, index) => ({
                eventId: match.id,
                personId: participant.personId,
                role: participant.role,
                position: index,
                })),
              skipDuplicates: true,
            });
          }
          updated += 1;
        } else {
          const event = await tx.calendarEvent.create({
            data: {
              ...data,
              scheduleId: schedule.id,
              externalId: sourceEvent.externalId,
            },
            select: { id: true },
          });
          if (participantIds.length > 0) {
            await tx.calendarEventPerson.createMany({
              data: participantIds.map((participant, index) => ({
                eventId: event.id,
                personId: participant.personId,
                role: participant.role,
                position: index,
                })),
              skipDuplicates: true,
            });
          }
          created += 1;
        }
      }

      // Rows that vanished from the sheet. Soft-deleted so the incremental
      // snapshot can tell offline clients to drop them.
      const orphanIds = existing
        .filter((row) => row.externalId !== null && !seen.has(row.externalId) && !row.deletedAt)
        .map((row) => row.id);

      let deleted = 0;
      if (orphanIds.length > 0) {
        if (SOFT_DELETE_ONLY) {
          const result = await tx.calendarEvent.updateMany({
            where: { id: { in: orphanIds } },
            data: { deletedAt: new Date() },
          });
          deleted = result.count;
        } else {
          const result = await tx.calendarEvent.deleteMany({ where: { id: { in: orphanIds } } });
          deleted = result.count;
        }
      }

      return { created, updated, deleted, peopleCreated: people.created };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

/** Sync every enabled schedule whose interval has elapsed. */
export async function syncDueSchedules(options: SyncOptions = {}): Promise<SyncResult[]> {
  const candidates = await prisma.schedule.findMany({
    where: {
      deletedAt: null,
      enabled: true,
      sourceType: "GOOGLE_SHEETS",
      source: { is: { syncIntervalMinutes: { gt: 0 } } },
    },
    include: { source: true },
  });

  const now = Date.now();
  const due = candidates.filter((schedule) => {
    const source = schedule.source;
    if (!source) return false;
    if (!source.lastSyncedAt) return true;
    const elapsedMinutes = (now - source.lastSyncedAt.getTime()) / 60_000;
    return elapsedMinutes >= source.syncIntervalMinutes;
  });

  const results: SyncResult[] = [];
  // Sequential on purpose: a handful of schedules, and it keeps well clear of
  // Google's per-minute quota.
  for (const schedule of due) {
    results.push(await syncSchedule(schedule.id, options));
  }
  return results;
}

// ---------------------------------------------------------------------------

async function markRunning(schedule: ScheduleWithSource): Promise<void> {
  if (!schedule.source) return;
  await prisma.scheduleSource
    .update({ where: { scheduleId: schedule.id }, data: { lastSyncStatus: "RUNNING" } })
    .catch(() => undefined);
}

async function markFailed(schedule: ScheduleWithSource, message: string): Promise<void> {
  if (!schedule.source) return;
  await prisma.scheduleSource
    .update({
      where: { scheduleId: schedule.id },
      data: { lastSyncStatus: "FAILED", lastSyncError: message.slice(0, 500) },
    })
    .catch(() => undefined);
}

function failure(scheduleId: string, startedAt: Date, error: string): SyncResult {
  const finishedAt = new Date();
  return {
    scheduleId,
    status: "FAILED",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: false,
    peopleCreated: 0,
    issues: [] as SourceIssue[],
    error,
  };
}

function describeError(error: unknown): string {
  if (error instanceof GoogleSheetsError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error while syncing";
}

/**
 * Records what a sync did, in this app's own audit trail.
 *
 * The calendar app wrote a JSON blob; this one's `detail` is a line of text
 * read by a person in /admin/audit, so the counts are written out as one.
 * Never allowed to fail the sync it is describing: an audit row that
 * couldn't be written is not a reason to discard an import that worked.
 */
async function recordAudit(
  actorEmail: string | undefined,
  action: string,
  entityId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!actorEmail) return;
  const summary = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== 0)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
  await logAudit(actorEmail, action, "Schedule", entityId, summary || null).catch(() => undefined);
}
