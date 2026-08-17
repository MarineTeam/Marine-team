import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

/** The SDK's session cookie, plus the numbered chunks it splits into when large. */
const SESSION_COOKIE = "__session";

/**
 * Wraps the Auth0 SDK's own middleware (Next 16 renamed Middleware to Proxy),
 * which serves the /auth/* routes and refreshes sessions.
 *
 * The one thing added on top: when the callback ends in a refusal, the session
 * cookie is stripped from the response. The SDK writes that cookie *after* the
 * onCallback hook returns (see src/lib/auth0.ts), so a redirect alone would
 * still hand the browser a logged-in session for someone we just refused.
 * Doing it here — the last thing that touches the response — is what makes
 * "no application session is created after a failed authorization" true rather
 * than merely intended.
 *
 * Proxy runs in the Node.js runtime by default in Next 16, so the
 * authorization checks behind this are free to use Prisma.
 */
export async function proxy(request: NextRequest) {
  const response = await auth0.middleware(request);

  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400 && location.includes("/access-denied")) {
    clearSessionCookies(request, response);
  }

  return response;
}

/**
 * Expires the session cookie and any chunks of it. Both `delete` and an
 * explicit expired `set` are used: `delete` removes a value the SDK queued on
 * this response, while the expired `set` is what actually tells a browser
 * holding an older cookie to drop it.
 */
function clearSessionCookies(request: NextRequest, response: NextResponse) {
  const names = new Set<string>([SESSION_COOKIE]);
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith(SESSION_COOKIE)) names.add(cookie.name);
  }
  for (const cookie of response.cookies.getAll()) {
    if (cookie.name.startsWith(SESSION_COOKIE)) names.add(cookie.name);
  }

  for (const name of names) {
    response.cookies.delete(name);
    response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
