import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, readSearchParams, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { createEvent } from "@/lib/schedules/admin-service";
import { listEvents } from "@/lib/schedules/query";
import { createEventSchema, eventsQuerySchema, idSchema } from "@/lib/validation/schemas";

/**
 * GET/POST /api/admin/schedules/:id/events
 *
 * The admin event list includes events from disabled schedules, which the
 * public endpoint hides.
 */

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  const scheduleId = idSchema.parse((await context.params).id);
  const query = readSearchParams(new URL(request.url), eventsQuerySchema);

  const events = await listEvents({
    scheduleIds: [scheduleId],
    personId: query.personId,
    from: query.from,
    to: query.to,
    limit: query.limit,
    includeDisabledSchedules: true,
  });

  return jsonOk({ events }, { headers: NO_STORE_HEADERS });
});

export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const scheduleId = idSchema.parse((await context.params).id);
  const body = await readJsonBody(request, createEventSchema);

  const event = await createEvent(scheduleId, body);
  await auditLog(admin.email, "event.create", "Event", event.id, {
    scheduleId,
    date: event.date,
  });

  return jsonOk({ event }, { status: 201, headers: NO_STORE_HEADERS });
});
