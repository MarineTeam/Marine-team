import { createHmac } from "node:crypto";

/**
 * Telling repeat views apart without keeping addresses.
 *
 * `/api/view-events` feeds Trending and Analytics and takes no sign-in, since
 * most viewers have none. It used to trust a cookie it had set on the caller
 * to say "you've already counted this one" — which a script simply doesn't
 * send, so one loop could put any sermon at the top of the home page.
 *
 * The throttle now also holds on the server, keyed by the caller's address.
 * The address itself is not stored: what is stored is an HMAC of it under a
 * server secret, so the column cannot be turned back into a list of who
 * watched what, and it is cleared after a day by the digest job — it is a
 * throttle key, not a record.
 */

/** How long one key counts as the same viewer of one item. */
export const VIEW_THROTTLE_SECONDS = 30 * 60;

/** How long a key is kept before the digest job blanks it. */
export const VIEW_KEY_RETENTION_HOURS = 24;

/**
 * The key for an address, or null when there is no address to key on — in
 * which case the route falls back to the cookie alone rather than refusing.
 */
export function viewKey(ip: string | null | undefined, secret: string | undefined): string | null {
  const address = ip?.trim();
  if (!address) return null;
  return createHmac("sha256", secret || "view-key").update(address).digest("hex").slice(0, 32);
}
