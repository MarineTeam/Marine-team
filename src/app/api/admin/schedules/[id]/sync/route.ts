import { jsonOk, NO_STORE_HEADERS, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { syncSchedule } from "@/lib/schedules/sync";
import { idSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/schedules/:id/sync
 *
 * The "Sync now" button. Rate limited per admin so an impatient double-click
 * cannot burn Google API quota, and because a sync is the one admin action
 * that makes an outbound request on every call.
 *
 * A failed sync leaves the previously imported events untouched -- see
 * `syncSchedule` -- so pressing this while Google is down is safe.
 */

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const scheduleId = idSchema.parse((await context.params).id);

    // Counted in the database rather than in memory: this app runs on
    // serverless functions with no shared process state, where an in-memory
    // counter resets or diverges per instance. The audit trail already
    // records every one of these, so it is what gets counted.
    const tooFast = await rateLimitResponse(
      () =>
        prisma.auditLog.count({
          where: {
            actorEmail: admin.email,
            action: { startsWith: "schedule." },
            createdAt: { gte: windowStart(60) },
          },
        }),
      10,
    );
    if (tooFast) return tooFast;

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    const result = await syncSchedule(scheduleId, { force, actorEmail: admin.email });

    // A failed sync is reported as 200 with `status: "FAILED"`: the request
    // itself succeeded, and the admin UI needs the structured detail
    // (which rows were malformed, what Google said) to be useful.
    return jsonOk({ result }, { headers: NO_STORE_HEADERS });
  },
);
