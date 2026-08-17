/**
 * Auth0 Action — Pre User Registration
 *
 * Stops an email that isn't on the application's allowlist from ever creating
 * an account. Paste this into Auth0 (Actions -> Library -> Build from scratch,
 * trigger "Pre User Registration") and add it to that flow.
 *
 * It never talks to PostgreSQL. Auth0 holds a URL and a shared secret; the
 * application endpoint is the only thing that can read the allowlist, and it
 * answers with nothing but a boolean.
 *
 * Required Action Secrets:
 *   AUTH0_REGISTRATION_CHECK_URL     https://your-domain/api/auth/registration-check
 *   AUTH0_REGISTRATION_CHECK_SECRET  the same value as the app's env var of that name
 *
 * Fails CLOSED: if the endpoint is unreachable, slow, misconfigured, or
 * answers anything other than a clear yes, registration is denied. An outage
 * must not become an open door.
 */

const TIMEOUT_MS = 5000;

exports.onExecutePreUserRegistration = async (event, api) => {
  const url = event.secrets.AUTH0_REGISTRATION_CHECK_URL;
  const secret = event.secrets.AUTH0_REGISTRATION_CHECK_SECRET;

  const deny = (reason) =>
    api.access.deny(
      // Shown to the person signing up: no internal detail.
      "You are not authorized to create an account for this application. Please contact an administrator.",
      reason,
    );

  if (!url || !secret) return deny("registration_check_not_configured");

  // Only ever call the configured HTTPS endpoint — never a URL derived from
  // anything in the event, which is what would turn this into an SSRF.
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    return deny("registration_check_bad_url");
  }
  if (endpoint.protocol !== "https:") return deny("registration_check_insecure_url");

  const email = (event.user.email || "").trim().toLowerCase();
  if (!email) return deny("registration_missing_email");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        email,
        auth0UserId: event.user.user_id,
        // The connection behind the signup, e.g. "google-oauth2".
        provider: event.connection && event.connection.strategy,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return deny("registration_check_unavailable");

    const body = await response.json();
    // Strict equality on a real boolean: a body that's missing the field, or
    // carries a truthy string, is not an authorization.
    if (body.allowed !== true) return deny("email_not_authorized");
  } catch {
    // Timeout, DNS failure, TLS problem, malformed JSON — all the same answer.
    return deny("registration_check_error");
  } finally {
    clearTimeout(timeout);
  }
};
