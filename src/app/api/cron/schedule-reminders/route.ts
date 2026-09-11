import { NextRequest, NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron-guard";
import { errorResponse } from "@/lib/api-guard";
import { sendScheduleReminders } from "@/lib/schedules/reminders";

/**
 * Tells people what they are on for tomorrow.
 *
 * Run this once a day, in the evening. It looks only at tomorrow, so running
 * it twice sends twice — which is why it is a daily job rather than an hourly
 * sweep. Same CRON_SECRET guard as the other scheduled jobs.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const refused = cronGuard(request);
    if (refused) return refused;
    return NextResponse.json(await sendScheduleReminders());
  } catch (error) {
    return errorResponse(error);
  }
}
