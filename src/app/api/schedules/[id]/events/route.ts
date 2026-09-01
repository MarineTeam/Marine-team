import { jsonOk, PUBLIC_CACHE_HEADERS, readSearchParams, withErrorHandling } from "@/lib/schedules/http";
import { listEvents } from "@/lib/schedules/query";
import { eventsQuerySchema, idSchema } from "@/lib/validation/schemas";

/**
 * GET /api/schedules/:id/events
 *
 * Public. Events for one schedule, optionally filtered by person and date
 * range. The response is identical whether the schedule is backed by Google
 * Sheets or by the admin UI -- that is the whole point of the provider
 * abstraction.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const scheduleId = idSchema.parse(id);
    const query = readSearchParams(new URL(request.url), eventsQuerySchema);

    const events = await listEvents({
      scheduleIds: [scheduleId],
      personId: query.personId,
      from: query.from,
      to: query.to,
      limit: query.limit,
    });

    return jsonOk({ events }, { headers: PUBLIC_CACHE_HEADERS });
  },
);
