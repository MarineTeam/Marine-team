import { NextResponse } from "next/server";
import type { ApiKey } from "@prisma/client";
import { RATE_LIMIT_PER_MINUTE, pageSize, type ApiScope } from "@/lib/api-keys";
import { authenticate, keyHasScope } from "@/lib/api-keys-query";
import { assertNoSecrets } from "@/lib/no-secrets";

/**
 * The shape every /api/v1 answer takes, and the door every one goes through.
 *
 * One envelope, one error shape, one way to page. That uniformity is most of
 * what makes an API pleasant: somebody who has written the code to read
 * `/api/v1/series` has already written the code to read every other list here.
 */

export const API_VERSION = "1";

/** A page of rows. `nextCursor` is absent — not null — on the last page. */
export function ok<T>(data: T, extra: { nextCursor?: string | null } = {}): NextResponse {
  const body: Record<string, unknown> = { data };
  if (extra.nextCursor) body.nextCursor = extra.nextCursor;

  // The same guard the data export uses. Both are places where a query quietly
  // changing shape becomes a leak, and this is the last thing between a
  // selected column and somebody else's server.
  assertNoSecrets(body, "answer");

  return NextResponse.json(body, {
    headers: {
      // Nothing here belongs in a shared cache: every answer depends on which
      // key asked, and some of them carry names.
      "Cache-Control": "private, no-store",
      "X-Api-Version": API_VERSION,
    },
  });
}

/** Every failure, in one shape, with a code a program can branch on. */
export function fail(status: number, code: string, message: string, retryAfter?: number): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Api-Version": API_VERSION,
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

/**
 * Cursor paging, by id.
 *
 * Not offset paging, and the reason matters for a feed somebody polls: rows
 * are added while they read, and `?offset=50` silently skips or repeats
 * whatever moved across the boundary. A cursor is the last id seen, so a page
 * means the same thing however much has changed since the one before it.
 */
export type Page = { take: number; cursor: string | null };

export function pageFrom(url: URL): Page {
  return { take: pageSize(url.searchParams.get("limit")), cursor: url.searchParams.get("cursor") };
}

/** The Prisma arguments for a page, including the extra row that reveals a next one. */
export function pageArgs(page: Page) {
  return {
    take: page.take + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  };
}

/**
 * Splits the extra row back off, and reports the cursor if there was one.
 *
 * Asking for one more row than the page holds is how "is there another page"
 * is answered without a second COUNT over the whole table — which on a big
 * catalogue costs more than the page itself.
 */
export function pageOut<T extends { id: string }>(rows: T[], page: Page): { rows: T[]; nextCursor: string | null } {
  if (rows.length <= page.take) return { rows, nextCursor: null };
  const kept = rows.slice(0, page.take);
  return { rows: kept, nextCursor: kept[kept.length - 1].id };
}

/**
 * `?updatedSince=2026-01-01T00:00:00Z`, for a caller syncing rather than
 * re-reading everything. An unparseable date is ignored rather than refused:
 * the worst it costs is a full page, and a sync job that dies on a malformed
 * timestamp it generated itself is a worse outcome than one that over-fetches.
 */
export function updatedSince(url: URL): Date | undefined {
  const raw = url.searchParams.get("updatedSince");
  if (!raw) return undefined;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/**
 * Wraps a route in authentication, the scope check and error handling.
 *
 * A refused request still counts against the key's minute, because it still
 * cost a lookup — not counting rejections would let somebody hammer with the
 * wrong scope for free.
 *
 * Every /api/v1 handler goes through this, so there is exactly one place where
 * a route could forget to check a key — and it is a place that cannot be
 * forgotten, because the handler doesn't run until it has one.
 */
/**
 * The same door, for a route that needs a valid key but no particular scope —
 * `/me`, which exists so a developer can find out what their key can do
 * without guessing endpoint by endpoint.
 */
export function withAnyKey(
  handler: (context: { url: URL; key: ApiKey }) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const outcome = await authenticate(request.headers.get("authorization"));
    if (!outcome.ok) return fail(outcome.status, outcome.code, outcome.message, outcome.retryAfter);
    try {
      const response = await handler({ url: new URL(request.url), key: outcome.key });
      response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE));
      return response;
    } catch (error) {
      console.error("API v1 error:", error);
      return fail(500, "server_error", "Something went wrong.");
    }
  };
}

export function withKey<P = Record<string, never>>(
  scope: ApiScope,
  handler: (context: { url: URL; key: ApiKey; params: P }) => Promise<NextResponse>,
): (request: Request, next?: { params: Promise<P> }) => Promise<NextResponse> {
  return async (request: Request, next?: { params: Promise<P> }) => {
    const outcome = await authenticate(request.headers.get("authorization"));
    if (!outcome.ok) return fail(outcome.status, outcome.code, outcome.message, outcome.retryAfter);

    if (!keyHasScope(outcome.key, scope)) {
      // The scope is named, because the caller is the organisation's own
      // developer and "forbidden" alone sends them to read the source.
      return fail(403, "missing_scope", `This key doesn't have the "${scope}" scope.`);
    }

    try {
      const params = next ? await next.params : ({} as P);
      const response = await handler({ url: new URL(request.url), key: outcome.key, params });
      response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE));
      return response;
    } catch (error) {
      // Never the upstream message: the errors thrown below here quote Prisma
      // query text and env var names, and this response leaves the building.
      console.error("API v1 error:", error);
      return fail(500, "server_error", "Something went wrong.");
    }
  };
}
