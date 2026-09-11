/**
 * Which URLs the server will send Web Push messages to.
 *
 * A push subscription is a URL the browser hands the page, and the page hands
 * us. The first version stored whatever URL arrived, and `web-push` will POST
 * to any string it is given — so a member could make this server send signed
 * requests to an address of their choosing, on every site notification, for
 * as long as the row lasted. And rows lasted, because nothing capped them:
 * a thousand endpoints for one member meant a thousand outbound requests per
 * notification, each awaited inside the fan-out.
 *
 * Browsers use a small, stable set of push services; that set is the
 * allow-list. A deployment that meets a browser not on it can add a host
 * suffix through `PUSH_SERVICE_HOSTS` rather than patching this file.
 */

/** Host suffixes, matched on a label boundary: `push.apple.com` allows `web.push.apple.com`. */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  "fcm.googleapis.com", // Chrome, and every Chromium browser that keeps Google's push: Brave, Vivaldi, Opera, Yandex
  "android.googleapis.com", // the older GCM endpoint the same browsers used
  "push.services.mozilla.com", // Firefox: updates.push.services.mozilla.com
  "notify.windows.com", // Edge: wns2-xxxx.notify.windows.com
  "push.apple.com", // Safari: web.push.apple.com
  "push.samsungosp.com", // Samsung Internet
];

/** How many subscriptions one member may hold; the oldest goes when a new one arrives. */
export const MAX_SUBSCRIPTIONS_PER_USER = 8;

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function extraHosts(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether this is an endpoint the server may push to.
 *
 * `https:` only — push services are all TLS, and a plain-http endpoint is a
 * sign the URL was not made by a browser. No credentials in the URL, for the
 * same reason.
 */
export function isPushServiceEndpoint(raw: string, env: string | undefined = process.env.PUSH_SERVICE_HOSTS): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase();
  return [...PUSH_SERVICE_HOSTS, ...extraHosts(env)].some((suffix) => hostMatches(hostname, suffix));
}

/**
 * Which of a member's existing subscriptions to drop to make room for one
 * more. Oldest first: a browser re-subscribes when its endpoint changes, so
 * the oldest rows are the ones most likely already dead.
 */
export function subscriptionsToEvict<T extends { createdAt: Date }>(
  existing: readonly T[],
  max: number = MAX_SUBSCRIPTIONS_PER_USER,
): T[] {
  const room = Math.max(0, max - 1);
  if (existing.length <= room) return [];
  return [...existing]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, existing.length - room);
}
