import { jsonOk, PUBLIC_CACHE_HEADERS, readSearchParams, withErrorHandling } from "@/lib/schedules/http";
import { listEvents } from "@/lib/schedules/query";
import { eventsQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/events
 *
 * Public. Events across every enabled schedule, filterable by schedule,
 * person and date range. Used by the calendar view when a device wants a
 * narrower slice than the full offline snapshot.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: Request) => {
  const query = readSearchParams(new URL(request.url), eventsQuerySchema);

  const events = await listEvents({
    scheduleIds: query.scheduleId,
    personId: query.personId,
    from: query.from,
    to: query.to,
    limit: query.limit,
  });

  return jsonOk({ events }, { headers: PUBLIC_CACHE_HEADERS });
});
