import type { z } from "zod";

import type { Prisma } from "@prisma/client";
import { fromIsoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api-guard";
import { normalizeName, toDisplayName } from "@/lib/names";
import { prisma, type PrismaTransaction } from "@/lib/db";
import { resolvePeople } from "@/lib/schedules/people";
import { eventInclude, serializeEvent, serializeSchedule } from "@/lib/schedules/query";
import type { CalendarEvent, Schedule } from "@/lib/schedules/types";
import { isGoogleSheetsConfigured } from "@/lib/sheets/client";
import { parserConfigSchema } from "@/lib/sheets/config";
import type {
  createEventSchema,
  createScheduleSchema,
  updateEventSchema,
  updateScheduleSchema,
} from "@/lib/validation/schemas";

/**
 * Admin write operations.
 *
 * Route handlers stay thin: they authenticate, validate, and delegate here.
 * Keeping the mutations in one module means the invariants -- unique slugs,
 * source configuration matching source type, people resolved through the
 * normalizer -- are enforced in exactly one place.
 */

type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
type CreateEventInput = z.infer<typeof createEventSchema>;
type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  if (input.sourceType === "GOOGLE_SHEETS" && !isGoogleSheetsConfigured()) {
    throw new ApiError(
      503,
      "google_not_configured",
      "Google Sheets is not configured on this server. Add service account credentials, or choose a web-managed schedule.",
    );
  }

  const slug = await uniqueSlug(input.slug ?? slugify(input.name));
  const displayOrder = input.displayOrder ?? (await nextDisplayOrder());

  const row = await prisma.schedule.create({
    data: {
      slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon,
      color: input.color,
      enabled: input.enabled,
      displayOrder,
      sourceType: input.sourceType,
      source:
        input.sourceType === "GOOGLE_SHEETS" && input.googleSheets
          ? {
              create: {
                type: "GOOGLE_SHEETS",
                spreadsheetId: input.googleSheets.spreadsheetId,
                sheetName: input.googleSheets.sheetName,
                range: input.googleSheets.range ?? null,
                format: input.googleSheets.format,
                parserConfig: (input.googleSheets.parserConfig ??
                  parserConfigSchema.parse({})) as Prisma.InputJsonValue,
                syncIntervalMinutes: input.googleSheets.syncIntervalMinutes ?? 60,
              },
            }
          : { create: { type: "WEB", parserConfig: {} } },
    },
    include: { source: true },
  });

  return serializeSchedule(row);
}

export async function updateSchedule(
  scheduleId: string,
  input: UpdateScheduleInput,
): Promise<Schedule> {
  const existing = await prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    include: { source: true },
  });
  if (!existing) throw new ApiError(404, "not_found", "That schedule no longer exists.");

  const nextSourceType = input.sourceType ?? existing.sourceType;

  if (nextSourceType === "GOOGLE_SHEETS") {
    if (!isGoogleSheetsConfigured()) {
      throw new ApiError(
        503,
        "google_not_configured",
        "Google Sheets is not configured on this server.",
      );
    }
    const hasConfig = input.googleSheets ?? existing.source?.spreadsheetId;
    if (!hasConfig) {
      throw new ApiError(
        422,
        "validation_failed",
        "A Google Sheets schedule needs a spreadsheet ID and sheet name.",
      );
    }
  }

  const data: Prisma.ScheduleUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = await uniqueSlug(input.slug, scheduleId);
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.color !== undefined) data.color = input.color;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.sourceType !== undefined) data.sourceType = input.sourceType;

  const row = await prisma.$transaction(async (tx) => {
    await tx.schedule.update({ where: { id: scheduleId }, data });

    if (input.googleSheets !== undefined || input.sourceType !== undefined) {
      if (nextSourceType === "GOOGLE_SHEETS" && input.googleSheets) {
        const sourceData = {
          type: "GOOGLE_SHEETS" as const,
          spreadsheetId: input.googleSheets.spreadsheetId,
          sheetName: input.googleSheets.sheetName,
          range: input.googleSheets.range ?? null,
          format: input.googleSheets.format,
          parserConfig: (input.googleSheets.parserConfig ??
            parserConfigSchema.parse({})) as Prisma.InputJsonValue,
          syncIntervalMinutes: input.googleSheets.syncIntervalMinutes ?? 60,
          // Configuration changed, so the previous fingerprint is meaningless.
          lastSyncHash: null,
        };
        await tx.scheduleSource.upsert({
          where: { scheduleId },
          update: sourceData,
          create: { scheduleId, ...sourceData },
        });
      } else if (nextSourceType === "WEB") {
        // Switching to web-managed keeps the events that were already imported
        // -- they become ordinary editable rows -- but stops any further sync.
        await tx.scheduleSource.upsert({
          where: { scheduleId },
          update: { type: "WEB", syncIntervalMinutes: 0, lastSyncHash: null, lastSyncError: null },
          create: { scheduleId, type: "WEB", parserConfig: {} },
        });
        await tx.calendarEvent.updateMany({
          where: { scheduleId, origin: "GOOGLE_SHEETS", deletedAt: null },
          data: { origin: "WEB" },
        });
      }
    }

    // Read back at the end rather than using the update's return value, so
    // the result reflects any source-side changes made just above.
    return tx.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: { source: true },
    });
  });

  return serializeSchedule(row);
}

/**
 * Soft-delete a schedule and its events.
 *
 * Soft rather than hard so offline clients receive the deletion in their next
 * incremental snapshot and drop the rows from their own cache.
 */
export async function deleteSchedule(scheduleId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.calendarEvent.updateMany({
      where: { scheduleId, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.schedule.update({
      where: { id: scheduleId },
      data: { deletedAt: now, enabled: false },
    }),
  ]);
}

export async function reorderSchedules(order: readonly string[]): Promise<Schedule[]> {
  await prisma.$transaction(
    order.map((scheduleId, index) =>
      prisma.schedule.updateMany({
        where: { id: scheduleId, deletedAt: null },
        data: { displayOrder: index },
      }),
    ),
  );

  const rows = await prisma.schedule.findMany({
    where: { deletedAt: null },
    include: { source: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeSchedule);
}

function slugify(name: string): string {
  const slug = normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "schedule";
}

async function uniqueSlug(candidate: string, excludeId?: string): Promise<string> {
  const base = slugify(candidate);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`.slice(0, 48);
    const clash = await prisma.schedule.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 48);
}

async function nextDisplayOrder(): Promise<number> {
  const last = await prisma.schedule.findFirst({
    where: { deletedAt: null },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  return (last?.displayOrder ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Resolve the mixed id/name participant list into concrete person ids. */
async function resolveParticipants(
  people: ReadonlyArray<{ personId?: string; name?: string; role?: string | null }>,
  tx: PrismaTransaction,
): Promise<Array<{ personId: string; role: string | null }>> {
  const namesToResolve = people
    .filter((participant) => !participant.personId && participant.name)
    .map((participant) => participant.name as string);

  const resolved = await resolvePeople(namesToResolve, tx);

  const explicitIds = people
    .map((participant) => participant.personId)
    .filter((id): id is string => typeof id === "string");

  if (explicitIds.length > 0) {
    const found = await tx.person.findMany({
      where: { id: { in: explicitIds }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(found.map((person) => person.id));
    const missing = explicitIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new ApiError(422, "validation_failed", "One of the selected people no longer exists.");
    }
  }

  const result: Array<{ personId: string; role: string | null }> = [];
  const seen = new Set<string>();
  for (const participant of people) {
    const personId =
      participant.personId ??
      (participant.name
        ? resolved.idByNormalizedName.get(normalizeName(toDisplayName(participant.name)))
        : undefined);
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    result.push({ personId, role: participant.role ?? null });
  }
  return result;
}

export async function createEvent(
  scheduleId: string,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    select: { id: true, sourceType: true },
  });
  if (!schedule) throw new ApiError(404, "not_found", "That schedule no longer exists.");

  const row = await prisma.$transaction(async (tx) => {
    const participants = await resolveParticipants(input.people, tx);

    const created = await tx.calendarEvent.create({
      data: {
        scheduleId,
        date: fromIsoDate(input.date),
        endDate: input.endDate ? fromIsoDate(input.endDate) : null,
        allDay: input.allDay,
        startTime: input.allDay ? null : input.startTime ?? null,
        endTime: input.allDay ? null : input.endTime ?? null,
        title: input.title ?? null,
        notes: input.notes ?? null,
        location: input.location ?? null,
        status: input.status,
        recurrenceRule: input.recurrenceRule ?? null,
        recurrenceEndDate: input.recurrenceEndDate ? fromIsoDate(input.recurrenceEndDate) : null,
        // Always WEB: an admin-created event is never owned by a sheet sync,
        // so a later sync of the same schedule will not remove it.
        origin: "WEB",
        people:
          participants.length > 0
            ? {
                createMany: {
                  // `position` preserves the order the admin picked people in,
                  // which is meaningful on a bread-and-cup style rota.
                  data: participants.map((participant, index) => ({
                    ...participant,
                    position: index,
                  })),
                  skipDuplicates: true,
                },
              }
            : undefined,
      },
      include: eventInclude,
    });

    return created;
  });

  return serializeEvent(row);
}

export async function updateEvent(
  eventId: string,
  input: UpdateEventInput,
): Promise<CalendarEvent> {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, scheduleId: true },
  });
  if (!existing) throw new ApiError(404, "not_found", "That event no longer exists.");

  const row = await prisma.$transaction(async (tx) => {
    const data: Prisma.CalendarEventUpdateInput = {};

    if (input.scheduleId !== undefined) {
      const target = await tx.schedule.findFirst({
        where: { id: input.scheduleId, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw new ApiError(422, "validation_failed", "That schedule no longer exists.");
      data.schedule = { connect: { id: input.scheduleId } };
    }
    if (input.date !== undefined) data.date = fromIsoDate(input.date);
    if (input.endDate !== undefined) {
      data.endDate = input.endDate ? fromIsoDate(input.endDate) : null;
    }
    if (input.allDay !== undefined) {
      data.allDay = input.allDay;
      if (input.allDay) {
        data.startTime = null;
        data.endTime = null;
      }
    }
    if (input.startTime !== undefined && input.allDay !== true) {
      data.startTime = input.startTime ?? null;
    }
    if (input.endTime !== undefined && input.allDay !== true) {
      data.endTime = input.endTime ?? null;
    }
    if (input.title !== undefined) data.title = input.title ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.location !== undefined) data.location = input.location ?? null;
    if (input.status !== undefined) data.status = input.status;
    if (input.recurrenceRule !== undefined) data.recurrenceRule = input.recurrenceRule ?? null;
    if (input.recurrenceEndDate !== undefined) {
      data.recurrenceEndDate = input.recurrenceEndDate
        ? fromIsoDate(input.recurrenceEndDate)
        : null;
    }

    // An edited event becomes locally owned, so the next sheet sync leaves the
    // admin's correction alone instead of overwriting it.
    data.origin = "WEB";

    await tx.calendarEvent.update({ where: { id: eventId }, data });

    if (input.people !== undefined) {
      const participants = await resolveParticipants(input.people, tx);
      await tx.calendarEventPerson.deleteMany({ where: { eventId } });
      if (participants.length > 0) {
        await tx.calendarEventPerson.createMany({
          data: participants.map((participant, index) => ({
            eventId,
            ...participant,
            position: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    return tx.calendarEvent.findUniqueOrThrow({ where: { id: eventId }, include: eventInclude });
  });

  return serializeEvent(row);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await prisma.calendarEvent.update({
    where: { id: eventId },
    data: { deletedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function createPerson(input: {
  displayName: string;
  active: boolean;
  aliases: string[];
}) {
  const displayName = toDisplayName(input.displayName);
  const normalized = normalizeName(displayName);

  const existing = await prisma.person.findUnique({ where: { normalizedName: normalized } });
  if (existing && existing.deletedAt === null) {
    throw new ApiError(409, "conflict", `${existing.displayName} is already on the list.`);
  }

  return prisma.person.upsert({
    where: { normalizedName: normalized },
    update: { displayName, active: input.active, deletedAt: null },
    create: {
      normalizedName: normalized,
      displayName,
      active: input.active,
      aliases: {
        createMany: {
          data: input.aliases
            .map((alias) => normalizeName(alias))
            .filter((alias) => alias && alias !== normalized)
            .map((alias) => ({ normalizedName: alias })),
          skipDuplicates: true,
        },
      },
    },
    include: { aliases: true },
  });
}

export async function updatePerson(
  personId: string,
  input: { displayName?: string; active?: boolean; aliases?: string[] },
) {
  return prisma.$transaction(async (tx) => {
    const data: Prisma.PersonUpdateInput = {};
    if (input.displayName !== undefined) {
      const displayName = toDisplayName(input.displayName);
      data.displayName = displayName;
      // The normalized key follows the display name, but a rename must not
      // collide with somebody else.
      const normalized = normalizeName(displayName);
      const clash = await tx.person.findFirst({
        where: { normalizedName: normalized, NOT: { id: personId } },
        select: { id: true, displayName: true },
      });
      if (clash) {
        throw new ApiError(
          409,
          "conflict",
          `${clash.displayName} already uses that name. Merge them instead.`,
        );
      }
      data.normalizedName = normalized;
    }
    if (input.active !== undefined) data.active = input.active;

    await tx.person.update({ where: { id: personId }, data });

    if (input.aliases !== undefined) {
      const person = await tx.person.findUniqueOrThrow({
        where: { id: personId },
        select: { normalizedName: true },
      });
      await tx.personAlias.deleteMany({ where: { personId } });
      const aliases = input.aliases
        .map((alias) => normalizeName(alias))
        .filter((alias) => alias && alias !== person.normalizedName);
      if (aliases.length > 0) {
        await tx.personAlias.createMany({
          data: aliases.map((alias) => ({ personId, normalizedName: alias })),
          skipDuplicates: true,
        });
      }
    }

    return tx.person.findUniqueOrThrow({ where: { id: personId }, include: { aliases: true } });
  });
}

/**
 * Merge a duplicate person into the canonical one.
 *
 * The duplicate's name becomes an alias of the target, so a future sync of the
 * spreadsheet that produced the duplicate resolves to the right person instead
 * of recreating it.
 */
export async function mergePeople(sourcePersonId: string, targetPersonId: string) {
  if (sourcePersonId === targetPersonId) {
    throw new ApiError(422, "validation_failed", "Choose two different people to merge.");
  }

  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.person.findUnique({ where: { id: sourcePersonId } }),
      tx.person.findUnique({ where: { id: targetPersonId } }),
    ]);
    if (!source || !target) {
      throw new ApiError(404, "not_found", "One of those people no longer exists.");
    }

    const sourceLinks = await tx.calendarEventPerson.findMany({
      where: { personId: sourcePersonId },
      select: { id: true, eventId: true, role: true },
    });
    const targetEventIds = new Set(
      (
        await tx.calendarEventPerson.findMany({
          where: { personId: targetPersonId },
          select: { eventId: true },
        })
      ).map((link) => link.eventId),
    );

    for (const link of sourceLinks) {
      if (targetEventIds.has(link.eventId)) {
        // The target is already on this event; drop the duplicate link.
        await tx.calendarEventPerson.delete({ where: { id: link.id } });
      } else {
        await tx.calendarEventPerson.update({
          where: { id: link.id },
          data: { personId: targetPersonId },
        });
      }
    }

    // The calendar app also re-pointed that person's push subscriptions here.
    // Reminders in this app go through its own push (see lib/push.ts), which
    // is keyed to an account rather than to a name on a rota, so there is
    // nothing of that kind to move.

    await tx.personAlias.updateMany({
      where: { personId: sourcePersonId },
      data: { personId: targetPersonId },
    });
    await tx.personAlias.create({
      data: { personId: targetPersonId, normalizedName: source.normalizedName },
    });

    await tx.person.delete({ where: { id: sourcePersonId } });

    return tx.person.findUniqueOrThrow({
      where: { id: targetPersonId },
      include: { aliases: true },
    });
  });
}

export async function deletePerson(personId: string): Promise<void> {
  await prisma.person.update({
    where: { id: personId },
    data: { deletedAt: new Date(), active: false },
  });
}
