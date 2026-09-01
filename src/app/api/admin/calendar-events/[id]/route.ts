import { ApiError, auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { prisma } from "@/lib/db";
import { deleteEvent, updateEvent } from "@/lib/schedules/admin-service";
import { getEvent } from "@/lib/schedules/query";
import { idSchema, updateEventSchema } from "@/lib/validation/schemas";

/** GET/PATCH/DELETE /api/admin/events/:id */

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  await requireAdmin();
  const eventId = idSchema.parse((await context.params).id);

  const event = await getEvent(eventId);
  if (!event) throw new ApiError(404, "not_found", "That event no longer exists.");

  return jsonOk({ event }, { headers: NO_STORE_HEADERS });
});

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const eventId = idSchema.parse((await context.params).id);
  const body = await readJsonBody(request, updateEventSchema);

  const event = await updateEvent(eventId, body);
  await auditLog(admin.email, "event.update", "Event", eventId, { fields: Object.keys(body) });

  return jsonOk({ event }, { headers: NO_STORE_HEADERS });
});

export const DELETE = withErrorHandling(async (_request: Request, context: Context) => {
  const admin = await requireAdmin();
  const eventId = idSchema.parse((await context.params).id);

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, scheduleId: true, date: true },
  });
  if (!existing) throw new ApiError(404, "not_found", "That event no longer exists.");

  await deleteEvent(eventId);
  await auditLog(admin.email, "event.delete", "Event", eventId, {
    scheduleId: existing.scheduleId,
  });

  return jsonOk({ ok: true }, { headers: NO_STORE_HEADERS });
});
