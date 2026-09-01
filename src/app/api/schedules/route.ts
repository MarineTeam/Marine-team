import { jsonOk, PUBLIC_CACHE_HEADERS, withErrorHandling } from "@/lib/schedules/http";
import { listPublicSchedules } from "@/lib/schedules/query";

/**
 * GET /api/schedules
 *
 * Public. Returns the enabled schedules in display order. No authentication:
 * the calendar is meant to be readable by anyone in the group without an
 * account, and nothing here reveals source configuration or credentials.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const schedules = await listPublicSchedules();
  return jsonOk({ schedules }, { headers: PUBLIC_CACHE_HEADERS });
});
