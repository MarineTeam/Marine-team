import { jsonOk, NO_STORE_HEADERS, readSearchParams, withErrorHandling } from "@/lib/schedules/http";
import { buildSnapshot } from "@/lib/schedules/query";
import { scheduleViewer } from "@/lib/schedules/viewer";
import { canSeeNames, visibleSnapshot } from "@/lib/schedules/visibility";
import { snapshotQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/sync/snapshot
 *
 * The endpoint the offline cache is built on.
 *
 *   - No `since`  -> a full snapshot; the client replaces its cache.
 *   - With `since` -> only rows changed after that timestamp, plus the ids of
 *     anything deleted, so a phone that has been offline for a week catches up
 *     in kilobytes.
 *
 * A signed-out device always gets a full snapshot, and one with nobody in it.
 * Full rather than a delta on purpose: the client replaces its cache on a full
 * snapshot, so a copy saved on a shared laptop while somebody was signed in
 * stops carrying their names the next time it syncs signed out. A delta would
 * have left them there.
 *
 * Deliberately `no-store`: a cached snapshot would hand the client a
 * `syncedAt` that does not match the data, and "Last synchronized" would start
 * lying. The service worker excludes this path for the same reason.
 */

export const dynamic = "force-dynamic";

/** Reject an absurd `since` rather than scanning the whole table. */
const MAX_SINCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const GET = withErrorHandling(async (request: Request) => {
  const query = readSearchParams(new URL(request.url), snapshotQuerySchema);
  const viewer = await scheduleViewer();

  let since: Date | null = null;
  if (query.since && canSeeNames(viewer)) {
    const parsed = new Date(query.since);
    const age = Date.now() - parsed.getTime();
    // A `since` that is too old, or in the future (clock skew), falls back to
    // a full snapshot instead of returning a confusing partial one.
    if (age >= 0 && age < MAX_SINCE_AGE_MS) since = parsed;
  }

  const snapshot = visibleSnapshot(await buildSnapshot({ since }), viewer);
  return jsonOk(snapshot, { headers: NO_STORE_HEADERS });
});
