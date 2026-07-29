import { NextResponse } from "next/server";

/**
 * Returns a 429 response if `count()` (typically a Prisma `.count()` scoped
 * to the current user and a recent time window) is at or over `max`, else
 * null. DB-backed rather than in-memory: this app runs on serverless
 * functions with no shared process state to count against, so an
 * in-memory counter would reset (or diverge across instances) every
 * invocation. Call sites check the return value directly rather than
 * catching a thrown error, matching how these member-facing write routes
 * (comments, ratings, reactions) don't wrap themselves in try/catch.
 */
export async function rateLimitResponse(count: () => Promise<number>, max: number): Promise<NextResponse | null> {
  if ((await count()) >= max) {
    return NextResponse.json({ error: "You're doing that too fast. Try again in a moment." }, { status: 429 });
  }
  return null;
}

/** `new Date` `windowSeconds` ago, for a `{ createdAt: { gte: ... } }` / `{ updatedAt: { gte: ... } }` filter. */
export function windowStart(windowSeconds: number): Date {
  return new Date(Date.now() - windowSeconds * 1000);
}
