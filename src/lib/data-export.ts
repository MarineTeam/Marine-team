import { assertNoSecrets } from "@/lib/no-secrets";
import { slugify } from "@/lib/slug";
import { toIsoDate } from "@/lib/dates";

/**
 * "Send me everything you hold about me", answered as a file.
 *
 * A member can already delete their account (see /api/profile DELETE). Taking a
 * copy first is the other half of the same right, and until now the app had no
 * answer to it: the only way out was to ask an admin to run queries.
 *
 * Three rules shape everything below, and they pull against each other:
 *
 *  1. **Completeness.** If a row is keyed to this member, it belongs in the
 *     file. A partial export is worse than none, because it looks complete.
 *  2. **Nobody else's data leaves with it.** Most of what a member touches here
 *     is *shared*: a comment sits under someone else's reply, a prayer they
 *     interceded for was written by a neighbour, a group meets at a leader's
 *     house. The export carries their side of each of those and stops. Where
 *     the app already has a rule about who may see something — a group's
 *     address, say — the export reuses that rule rather than inventing a
 *     second one that could drift from it.
 *  3. **No live secret goes into a downloaded file.** An export gets emailed to
 *     a laptop, put on a USB stick, forwarded to a solicitor. A Web Push key
 *     pair or a television's token in that file is a capability anybody
 *     downstream could use. `assertExportSafe` below is a runtime backstop for
 *     that, not a substitute for not selecting the columns.
 *
 * The shaping lives here, away from Prisma, so it can be tested against plain
 * objects; `data-export-query.ts` does the reading.
 */

/**
 * Bumped when the shape changes in a way that would break something reading an
 * older file. Written into every export so a reader can tell.
 */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Refuses to answer with a document carrying a credential.
 *
 * The list and the walk live in `no-secrets.ts`, shared with the read API:
 * both are places where a query quietly changing shape becomes a leak, and one
 * list is what stops the two drifting apart.
 */
export function assertExportSafe(doc: unknown): void {
  assertNoSecrets(doc, "export");
}

/**
 * What the browser saves it as: `marine-team-alice-2026-09-02.json`.
 *
 * Named after the member so two exports from one household don't overwrite
 * each other in a downloads folder, and dated because the file is a snapshot —
 * "which one is current?" is the first question anyone asks of the second one.
 */
export function exportFilename(email: string, at: Date): string {
  const local = slugify(email.split("@")[0] ?? "") || "member";
  return `marine-team-${local}-${toIsoDate(at)}.json`;
}

/**
 * The push service a browser subscribed through ("https://fcm.googleapis.com"),
 * without the per-browser path that identifies the subscription.
 *
 * The member asked what devices are signed up, not for the endpoint that would
 * let a reader of the file push to their phone. An endpoint that doesn't parse
 * is reported as unknown rather than passed through — an unparseable string is
 * exactly the case where "just include it" would include the whole thing.
 */
export function pushServiceOf(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return "unknown";
  }
}

/** How many records the file holds, counting every list in it at any depth. */
export function totalRecords(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length + value.reduce<number>((sum, item) => sum + totalRecords(item), 0);
  }
  if (value === null || typeof value !== "object") return 0;
  return Object.values(value).reduce<number>((sum, child) => sum + totalRecords(child), 0);
}
