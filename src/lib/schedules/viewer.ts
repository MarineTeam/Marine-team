import { getCurrentUser } from "@/lib/current-user";
import type { ScheduleViewer } from "@/lib/schedules/visibility";

/**
 * Who is asking, for the purposes of the rota — kept apart from
 * `visibility.ts` so the rules there stay free of a session and a database.
 *
 * "Signed in" here means an *authorized* member: `getCurrentUser` answers
 * null for a session whose email has been taken off the allowlist, so a
 * revoked member loses the names on their next request like everything else.
 */
export async function scheduleViewer(): Promise<ScheduleViewer> {
  return { signedIn: (await getCurrentUser()) !== null };
}
