import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ApiError, errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { ensureStaff, ensureCapability } from "@/lib/permissions";

/**
 * The idioms the schedules routes were written against, on this app's own
 * primitives.
 *
 * The calendar app had its own HTTP layer: a guard, a body reader, a JSON
 * responder and an error wrapper. Rewriting twenty-odd route handlers to
 * spell those differently would have been a large diff with nothing to show
 * for it, and a chance to get one of them wrong. So the four names survive
 * and are implemented here — `requireAdmin` on this app's staff check and
 * capabilities, `withErrorHandling` on its single `errorResponse`, `auditLog`
 * on its one audit trail. Nothing downstream of a route sees a second way of
 * doing anything.
 */

/** Bodies larger than this are refused before parsing. */
const MAX_BODY_BYTES = 256 * 1024;

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

/**
 * The public schedule reads are the same for everybody and change when a sync
 * runs, so a short shared cache is worth having in front of them.
 */
export const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
} as const;

/** Re-exported so a route imports its guard, its responder and its error from one place. */
export { ApiError };

/** A refusal with a code, for the routes that answer one directly. */
export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * A schedule is staff work, gated like the service plans it sits beside:
 * whoever arranges what happens on a Sunday arranges the rotas for it.
 */
export async function requireAdmin() {
  const user = await ensureStaff();
  await ensureCapability(user, "manage_files");
  return user;
}

export function jsonOk<T>(data: T, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

/** Parses and validates a JSON body. Throws `ApiError`, which `errorResponse` renders. */
export async function readJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", "That request is too large.");
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", "That request is too large.");
    }
    raw = text.length === 0 ? {} : JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "That request body isn't valid JSON.");
  }

  // Thrown rather than returned, and rendered by errorResponse, which already
  // knows how to describe a Zod failure without leaking anything internal.
  return schema.parse(raw);
}

/** Reads and validates query parameters the same way. */
export function readSearchParams<T>(url: URL, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response>;

/** Wraps a handler so every thrown thing becomes one of this app's responses. */
export function withErrorHandling<Args extends unknown[]>(handler: Handler<Args>): Handler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * An audit entry for a schedule action.
 *
 * The calendar app stored a JSON blob; this app's `detail` is a line of text
 * somebody reads in /admin/audit, so the fields are written out as one.
 */
export async function auditLog(
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const summary = detail
    ? Object.entries(detail)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(", ")
    : "";
  await logAudit(actorEmail, action, entityType, entityId, summary || null);
}
