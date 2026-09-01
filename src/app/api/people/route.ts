import { jsonOk, PUBLIC_CACHE_HEADERS, withErrorHandling } from "@/lib/schedules/http";
import { listPeople } from "@/lib/schedules/query";

/**
 * GET /api/people
 *
 * Public. Powers the "Choose your name" screen.
 *
 * This exposes the names that already appear on schedules the whole group can
 * see, and nothing else: no email addresses, no phone numbers, no contact
 * details of any kind. Selecting a name is a device preference, not a login,
 * so this endpoint grants no access to anything.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const people = await listPeople();
  return jsonOk({ people }, { headers: PUBLIC_CACHE_HEADERS });
});
