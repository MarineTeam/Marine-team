import { NextResponse } from "next/server";
import { API_SCOPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, RATE_LIMIT_PER_MINUTE } from "@/lib/api-keys";
import { API_VERSION } from "@/lib/api-v1";

/**
 * What this API is, for whoever has just been handed a key.
 *
 * Unauthenticated on purpose. It carries no data — only the shape of the thing
 * — and an API whose own documentation needs a credential is one where the
 * first five minutes are spent on the wrong problem.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    version: API_VERSION,
    authentication: "Authorization: Bearer mt_live_…  (make a key at /admin/api-keys)",
    rateLimit: { requestsPerMinute: RATE_LIMIT_PER_MINUTE, header: "X-RateLimit-Limit" },
    paging: {
      style: "cursor",
      parameters: { limit: `1–${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE}`, cursor: "the nextCursor from the last page" },
      note: "A response carries `nextCursor` only when there is another page.",
    },
    scopes: API_SCOPES.map(({ scope, description, personal }) => ({ scope, description, personalData: personal })),
    endpoints: [
      { path: "/api/v1/me", scope: "any", describes: "What this key is and what it may read." },
      { path: "/api/v1/categories", scope: "content:read" },
      { path: "/api/v1/series", scope: "content:read", filters: ["categoryId", "updatedSince"] },
      { path: "/api/v1/videos", scope: "content:read", filters: ["seriesId", "categoryId", "updatedSince"] },
      {
        path: "/api/v1/files",
        scope: "content:read",
        filters: ["seriesId", "addedSince"],
        note: "A file has no updatedAt — it is replaced rather than edited — so the filter is addedSince.",
      },
      { path: "/api/v1/events", scope: "events:read", filters: ["from", "to", "updatedSince"] },
      { path: "/api/v1/events/{id}/registrations", scope: "events:registrations" },
      { path: "/api/v1/schedules", scope: "calendar:read" },
      { path: "/api/v1/calendar-events", scope: "calendar:read", filters: ["scheduleId", "from", "to"] },
      { path: "/api/v1/groups", scope: "groups:read" },
      { path: "/api/v1/analytics", scope: "analytics:read" },
    ],
    // Said here rather than only in the docs, because it is the question a
    // developer asks first and the answer shapes what they build.
    writes: "None. Every endpoint is a read; there is no way to change anything through this API.",
  });
}
