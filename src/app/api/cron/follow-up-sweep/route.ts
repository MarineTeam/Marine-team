import { NextRequest, NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron-guard";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { sweep } from "@/lib/follow-ups-query";

/**
 * Turns yesterday into jobs.
 *
 * Idempotent by (source, reference): running it twice raises nothing twice,
 * and a card somebody already dismissed never comes back — which is the
 * failure that teaches people to ignore a queue.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const refused = cronGuard(request);
    if (refused) return refused;
    if (!(await isPluginEnabled("follow-ups"))) return NextResponse.json({ ok: true, skipped: true });

    // A week back rather than a day: a sweep that missed a night should catch
    // up rather than lose the cards it would have raised.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ ranAt: new Date().toISOString(), ...(await sweep(since)) });
  } catch (error) {
    return errorResponse(error);
  }
}
