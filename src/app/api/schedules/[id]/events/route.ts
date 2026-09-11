import { ApiError, jsonOk, NO_STORE_HEADERS, readSearchParams, withErrorHandling } from "@/lib/schedules/http";
import { listEvents } from "@/lib/schedules/query";
import { scheduleViewer } from "@/lib/schedules/viewer";
import { canSeeNames, NAMES_WITHHELD, visibleEvents } from "@/lib/schedules/visibility";
import { eventsQuerySchema, idSchema } from "@/lib/validation/schemas";

/**
 * GET /api/schedules/:id/events
 *
 * Events for one schedule, optionally filtered by person and date range. The
 * response is identical whether the schedule is backed by Google Sheets or by
 * the admin UI -- that is the whole point of the provider abstraction.
 *
 * Same rule as /api/calendar-events: the dates for anybody, the names for
 * members, and no filtering by person without a sign-in.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const scheduleId = idSchema.parse(id);
    const query = readSearchParams(new URL(request.url), eventsQuerySchema);
    const viewer = await scheduleViewer();
    if (query.personId && !canSeeNames(viewer)) throw new ApiError(403, "sign_in", NAMES_WITHHELD);

    const events = await listEvents({
      scheduleIds: [scheduleId],
      personId: query.personId,
      from: query.from,
      to: query.to,
      limit: query.limit,
    });

    return jsonOk({ events: visibleEvents(events, viewer) }, { headers: NO_STORE_HEADERS });
  },
);
