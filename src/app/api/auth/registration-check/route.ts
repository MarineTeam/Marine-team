import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  clientIpFrom,
  isEmailAuthorized,
  normalizeEmail,
  providerFromSub,
  recordAccessAttempt,
} from "@/lib/authorization";

const schema = z.object({
  email: z.string().min(3).max(254),
  /** Auth0's user id for the pending registration, when the Action has one. */
  auth0UserId: z.string().max(128).optional(),
  /** The connection the signup came through, e.g. "google-oauth2". */
  provider: z.string().max(64).optional(),
});

/**
 * Called by the Auth0 **Pre-User Registration Action** to ask whether an email
 * is allowed to create an account here. Answers with nothing but a boolean.
 *
 * This exists so the Action never touches PostgreSQL: Auth0 holds a URL and a
 * shared secret, not database credentials, and this endpoint is the only thing
 * that can read the allowlist.
 *
 * Note what it deliberately does *not* do: it never confirms an account
 * exists, never returns any part of the list, and answers identically for
 * "not on the list" and "malformed" — so it can't be used as an oracle to
 * enumerate who has access.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.AUTH0_REGISTRATION_CHECK_SECRET;
  if (!secret) {
    // Fail closed: an unconfigured deployment must refuse registrations, not
    // wave them through.
    console.error("AUTH0_REGISTRATION_CHECK_SECRET is not set; refusing registration checks");
    return NextResponse.json({ allowed: false }, { status: 503 });
  }

  if (!hasValidSecret(request, secret)) {
    // No detail, and no hint that the secret was the problem.
    return NextResponse.json({ allowed: false }, { status: 401 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ allowed: false }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const allowed = await isEmailAuthorized(email);

  if (!allowed) {
    await recordAccessAttempt({
      email,
      auth0UserId: body.auth0UserId ?? null,
      provider: body.provider ?? providerFromSub(body.auth0UserId),
      attemptType: "SIGNUP",
      // Registration happens before any organization is joined, so this says
      // only what it knows: the email wasn't on the list.
      organizationMember: false,
      emailAuthorized: false,
      reason: "EMAIL_NOT_AUTHORIZED",
      ipAddress: clientIpFrom(request.headers),
      userAgent: request.headers.get("user-agent"),
      dedupeMinutes: 60,
    });
  }

  return NextResponse.json({ allowed });
}

/**
 * Compares the bearer token in constant time. A plain `===` on a secret leaks
 * how much of it was right through timing, which is worth avoiding on an
 * endpoint anyone on the internet can call.
 */
function hasValidSecret(request: NextRequest, expected: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // timing signal — compare lengths first and return the same false either way.
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}
