import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { stopSeries, updateSeries } from "@/lib/event-series-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  rule: z.string().trim().min(1).max(200).optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 30).nullable().optional(),
  allDay: z.boolean().optional(),
  description: z.string().max(5000).nullish(),
  location: z.string().max(300).nullish(),
  published: z.boolean().optional(),
  memberOnly: z.boolean().optional(),
  registration: z.boolean().optional(),
  capacity: z.number().int().min(0).max(100000).nullable().optional(),
  waitlist: z.boolean().optional(),
  maxGuests: z.number().int().min(0).max(50).optional(),
  opensDaysBefore: z.number().int().min(0).max(730).nullable().optional(),
  closesDaysBefore: z.number().int().min(0).max(730).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const result = await updateSeries(id, patchSchema.parse(await request.json()));
    await logAudit(
      user.email,
      "update",
      "event-series",
      id,
      `${result.series.title} — ${result.created} added, ${result.moved} updated, ${result.stranded} left where they were`,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Stops the series repeating. Deliberately not called "delete": the dates
 * people have signed up for survive it as ordinary events — see `stopSeries`.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const result = await stopSeries(id);
    await logAudit(user.email, "stop", "event-series", id, `${result.removed} removed, ${result.kept} kept`);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
