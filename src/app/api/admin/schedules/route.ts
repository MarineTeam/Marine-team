import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { createSchedule } from "@/lib/schedules/admin-service";
import { listAllSchedules } from "@/lib/schedules/query";
import { createScheduleSchema } from "@/lib/validation/schemas";

/**
 * GET/POST /api/admin/schedules
 *
 * Every handler in the /api/admin tree begins with `requireAdmin()`, which
 * reads the verified Auth0 session server-side. No header, cookie value or
 * request body can influence that decision.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const schedules = await listAllSchedules();
  return jsonOk({ schedules }, { headers: NO_STORE_HEADERS });
});

export const POST = withErrorHandling(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await readJsonBody(request, createScheduleSchema);

  const schedule = await createSchedule(body);
  await auditLog(admin.email, "schedule.create", "Schedule", schedule.id, {
    name: schedule.name,
    sourceType: schedule.sourceType,
  });

  return jsonOk({ schedule }, { status: 201, headers: NO_STORE_HEADERS });
});
