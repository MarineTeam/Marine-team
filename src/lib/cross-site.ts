/**
 * Whether a request is a write to the API that the browser itself says came
 * from another site.
 *
 * The session cookie is `SameSite=Lax`, which is what keeps a page on another
 * origin from POSTing to /api/* as the signed-in member. This is the second
 * layer, checked at the door in src/proxy.ts: `Sec-Fetch-Site` is set by the
 * browser and cannot be set by a page, so a request that arrives labelled
 * `cross-site` is refused before any route runs, whatever a cookie setting
 * elsewhere turns out to be.
 *
 * Absent means a non-browser caller — Auth0's registration check, a
 * television, a script with an API key — and those are unaffected.
 * `same-origin`, `same-site` and `none` (a URL typed into the bar) are all
 * fine. Only the API is covered: the /auth/* routes are the SDK's, pages have
 * no writes, and nothing on this site is meant to be posted to from another.
 */

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteWrite(request: {
  method: string;
  nextUrl: { pathname: string };
  headers: { get(name: string): string | null };
}): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  return request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site";
}
