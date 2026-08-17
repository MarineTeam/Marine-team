import type { DownloadPlatform } from "@prisma/client";

/**
 * The one piece of download logic both sides need: whether the policy's
 * platform matches the client asking.
 *
 * Its own module because the download button is a client component, and
 * src/lib/downloads.ts reaches through content.ts to `next/headers` — which a
 * client bundle can't import. Nothing here touches a request, a database, or
 * the DOM, so it's safe on either side.
 */

/** What the client reports itself as: an installed PWA, or an ordinary browser tab. */
export type ClientPlatform = "web" | "pwa";

/**
 * The platform is claimed by the client (it's the only side that can see
 * `display-mode: standalone`), so this is a placement rule rather than a
 * security boundary — a crafted request could claim to be the app. That's
 * acceptable precisely because it never widens *who* may download or *what*:
 * those come from the policy and the content, which are server-side facts.
 */
export function isPlatformAllowed(policy: DownloadPlatform, client: ClientPlatform): boolean {
  if (policy === "BOTH") return true;
  return policy === (client === "pwa" ? "PWA" : "WEB");
}
