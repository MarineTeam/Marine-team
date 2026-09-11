import { ApiError, jsonOk, NO_STORE_HEADERS, withErrorHandling } from "@/lib/schedules/http";
import { listPeople } from "@/lib/schedules/query";
import { scheduleViewer } from "@/lib/schedules/viewer";
import { canSeeNames, NAMES_WITHHELD } from "@/lib/schedules/visibility";

/**
 * GET /api/people
 *
 * The names on the rotas, for signed-in members. Powers the "Choose your
 * name" control.
 *
 * This used to be public — the calendar app it came from was built for
 * people who never log in — and that put every rota volunteer's name on the
 * open internet beside the days they are at the building. Now it is a 403
 * without a session: there is nothing else in this answer, so an empty list
 * would only be a 403 that didn't say so. See lib/schedules/visibility.ts.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  if (!canSeeNames(await scheduleViewer())) throw new ApiError(403, "sign_in", NAMES_WITHHELD);
  const people = await listPeople();
  return jsonOk({ people }, { headers: NO_STORE_HEADERS });
});
