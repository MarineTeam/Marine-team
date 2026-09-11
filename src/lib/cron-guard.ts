import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * The one gate every scheduled job stands behind.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set. The eight routes under /api/cron used to each carry their own copy of
 * the check, and every copy had the same shape: `if (secret && header !==
 * …)`. Read that again — with the variable *unset*, the condition is false and
 * the job runs for anybody. A preview deployment that didn't get the variable,
 * a new project, a rotated secret not yet re-added: each turns transcription
 * (paid, per call), broadcast sends and feed syncs into public endpoints.
 *
 * So this fails closed where it matters. In production a missing secret is a
 * 503, the same answer registration-check gives for the same mistake, and the
 * message says what to set. In development it stays open, because a local
 * `curl` of a cron route is how these get tested.
 */

export type CronVerdict = "ok" | "unconfigured" | "refused";

/** The decision, with no request or environment in it, so it can be tested. */
export function cronVerdict(
  authorization: string | null,
  secret: string | undefined,
  production: boolean,
): CronVerdict {
  if (!secret) return production ? "unconfigured" : "ok";
  const expected = `Bearer ${secret}`;
  // Digests, so the comparison is constant-time whatever the lengths.
  const left = createHash("sha256").update(authorization ?? "").digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right) ? "ok" : "refused";
}

/**
 * Null when the caller may run the job; otherwise the response to return.
 *
 * Takes the request rather than the header so a route can't pass the wrong
 * one, and reads the environment here rather than at import time so a test
 * can set it.
 */
export function cronGuard(request: Request): NextResponse | null {
  const verdict = cronVerdict(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
    process.env.NODE_ENV === "production",
  );
  switch (verdict) {
    case "ok":
      return null;
    case "unconfigured":
      console.error("CRON_SECRET is not set; refusing to run scheduled jobs");
      return NextResponse.json(
        { error: "Scheduled jobs are not configured on this deployment." },
        { status: 503 },
      );
    case "refused":
      return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
}
