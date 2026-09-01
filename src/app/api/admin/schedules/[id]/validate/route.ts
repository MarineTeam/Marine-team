import { ApiError, jsonOk, NO_STORE_HEADERS, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { prisma } from "@/lib/db";
import { getProviderForSchedule } from "@/lib/schedules/provider";
import { idSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/schedules/:id/validate
 *
 * The "Test connection" button. Reads the source and reports what the parser
 * found -- a preview of the first few events plus every row-level problem --
 * without writing anything to the database.
 *
 * This is the feedback loop that makes column mapping tractable: an admin can
 * adjust the parser settings and see immediately whether the sheet parses,
 * instead of syncing and then hunting through the results.
 */

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const scheduleId = idSchema.parse((await context.params).id);

    // No rate limit here, unlike the calendar app's in-memory one. This is a
    // staff-only probe behind requireAdmin, that limiter was explicitly not an
    // authorization control, and an in-memory counter is per instance on
    // serverless anyway — this app's limits are database-backed and belong on
    // the member-facing writes that have something to count.

    const schedule = await prisma.schedule.findFirst({
      where: { id: scheduleId, deletedAt: null },
      include: { source: true },
    });
    if (!schedule) throw new ApiError(404, "not_found", "That schedule no longer exists.");

    try {
      const provider = getProviderForSchedule(schedule);
      const validation = await provider.validate();
      return jsonOk({ validation }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      // A misconfigured source is expected input here, not a server fault, so
      // it comes back as a structured failure the form can render inline.
      return jsonOk(
        {
          validation: {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : "Could not read this schedule's data source.",
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    }
  },
);
