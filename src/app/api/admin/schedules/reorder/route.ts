import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { reorderSchedules } from "@/lib/schedules/admin-service";
import { reorderSchedulesSchema } from "@/lib/validation/schemas";

/** POST /api/admin/schedules/reorder -- sets `displayOrder` from array order. */

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await readJsonBody(request, reorderSchedulesSchema);

  const schedules = await reorderSchedules(body.order);
  await auditLog(admin.email, "schedule.reorder", "Schedule", "", { count: body.order.length });

  return jsonOk({ schedules }, { headers: NO_STORE_HEADERS });
});
