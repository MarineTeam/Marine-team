import { ApiError, jsonOk, NO_STORE_HEADERS, readSearchParams, withErrorHandling } from "@/lib/schedules/http";
import { listEvents } from "@/lib/schedules/query";
import { scheduleViewer } from "@/lib/schedules/viewer";
import { canSeeNames, NAMES_WITHHELD, visibleEvents } from "@/lib/schedules/visibility";
import { eventsQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/calendar-events
 *
 * Events across every enabled schedule, filterable by schedule, person and
 * date range. Used by the calendar view when a device wants a narrower slice
 * than the full offline snapshot.
 *
 * The structure is public; the people on it are for members. A signed-out
 * caller gets the same events with nobody on them, and may not filter by
 * person at all — "which days is this id on" is the same question as "who is
 * this", asked sideways. The answer varies by viewer, so it is never shared
 * by a cache.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: Request) => {
  const query = readSearchParams(new URL(request.url), eventsQuerySchema);
  const viewer = await scheduleViewer();
  if (query.personId && !canSeeNames(viewer)) throw new ApiError(403, "sign_in", NAMES_WITHHELD);

  const events = await listEvents({
    scheduleIds: query.scheduleId,
    personId: query.personId,
    from: query.from,
    to: query.to,
    limit: query.limit,
  });

  return jsonOk({ events: visibleEvents(events, viewer) }, { headers: NO_STORE_HEADERS });
});
