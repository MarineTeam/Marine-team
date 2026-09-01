import { ApiError, auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { prisma } from "@/lib/db";
import { deleteSchedule, updateSchedule } from "@/lib/schedules/admin-service";
import { serializeSchedule } from "@/lib/schedules/query";
import { idSchema, updateScheduleSchema } from "@/lib/validation/schemas";

/**
 * GET/PATCH/DELETE /api/admin/schedules/:id
 *
 * The GET here returns the *full* schedule including its source configuration
 * (spreadsheet id, sheet name, parser settings). That is why it is admin-only
 * while the public `/api/schedules` deliberately omits those fields.
 */

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  await requireAdmin();
  const scheduleId = idSchema.parse((await context.params).id);

  const row = await prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    include: { source: true, _count: { select: { events: true } } },
  });
  if (!row) throw new ApiError(404, "not_found", "That schedule no longer exists.");

  return jsonOk(
    {
      schedule: serializeSchedule(row),
      eventCount: row._count.events,
      source: row.source
        ? {
            type: row.source.type,
            spreadsheetId: row.source.spreadsheetId,
            sheetName: row.source.sheetName,
            range: row.source.range,
            format: row.source.format,
            parserConfig: row.source.parserConfig,
            syncIntervalMinutes: row.source.syncIntervalMinutes,
            lastSyncedAt: row.source.lastSyncedAt?.toISOString() ?? null,
            lastSyncStatus: row.source.lastSyncStatus,
            lastSyncError: row.source.lastSyncError,
          }
        : null,
    },
    { headers: NO_STORE_HEADERS },
  );
});

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const scheduleId = idSchema.parse((await context.params).id);
  const body = await readJsonBody(request, updateScheduleSchema);

  const schedule = await updateSchedule(scheduleId, body);
  await auditLog(admin.email, "schedule.update", "Schedule", scheduleId, {
    fields: Object.keys(body),
  });

  return jsonOk({ schedule }, { headers: NO_STORE_HEADERS });
});

export const DELETE = withErrorHandling(async (_request: Request, context: Context) => {
  const admin = await requireAdmin();
  const scheduleId = idSchema.parse((await context.params).id);

  const existing = await prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw new ApiError(404, "not_found", "That schedule no longer exists.");

  await deleteSchedule(scheduleId);
  await auditLog(admin.email, "schedule.delete", "Schedule", scheduleId, { name: existing.name });

  return jsonOk({ ok: true }, { headers: NO_STORE_HEADERS });
});
