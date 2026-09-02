/**
 * The one list of column names that must never leave this app, and the walk
 * that proves they haven't.
 *
 * Two things now carry data out of here in bulk — a member's own data export
 * and the read API — and they are the two places where a query quietly
 * changing shape turns into a leak nobody notices. Rather than each keeping
 * its own list, both check against this one, so a column added to the schema
 * has a single place to be forbidden and neither exit can drift from the
 * other.
 */

/**
 * Key names that must never appear in anything this app hands out, at any
 * depth.
 *
 * These are the columns that are *credentials*, not facts: the Web Push pair
 * that lets the holder push to a browser, the secret in a personal calendar
 * feed's URL, the hashes behind a share-link passphrase, a television's
 * sign-in and an API key — plus the staff names attached to decisions taken
 * about a member (`mutedBy`, `moderatedBy`, `handledBy`) or about something
 * sent to them (`createdBy`). The decision is theirs to see; the name of the
 * person who took it is not.
 *
 * Matched on the exact key, so `auth` here does not catch `auth0Id`, which is
 * a member's own identifier and belongs in their file.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  "auth",
  "p256dh",
  "passwordHash",
  "passwordSalt",
  "salt",
  "secret",
  "tokenHash",
  "deviceCodeHash",
  "calendarToken",
  "hashedKey",
  "mutedBy",
  "moderatedBy",
  "handledBy",
  "createdBy",
];

/**
 * Every path in `value` whose last segment is a forbidden key.
 *
 * Walks arrays as well as objects: nearly everything handed out here is a
 * list, so a check that only descended into objects would pass on every real
 * payload while catching nothing.
 */
export function unsafeKeysIn(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unsafeKeysIn(item, `${path}[${index}]`));
  }
  if (value === null || typeof value !== "object") return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}.${key}`;
    if (FORBIDDEN_KEYS.includes(key)) found.push(here);
    found.push(...unsafeKeysIn(child, here));
  }
  return found;
}

/**
 * Throws rather than handing out a payload carrying a credential.
 *
 * Deliberately a hard failure and not a filter: a key reaching here means a
 * query started selecting something it shouldn't, and quietly stripping it
 * would hide that until the next column arrives. A caller seeing an error is
 * recoverable; a leaked push key is not.
 *
 * `what` names the exit in the message, so a log line says which one it was.
 */
export function assertNoSecrets(payload: unknown, what = "hand that out"): void {
  const unsafe = unsafeKeysIn(payload);
  if (unsafe.length > 0) {
    throw new Error(`Refusing to ${what}: ${unsafe.join(", ")}`);
  }
}
