import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { syncDueSchedules } from "@/lib/schedules/sync";

/**
 * Imports every Google Sheets schedule whose interval has elapsed.
 *
 * Point the scheduler at this hourly. Only schedules actually due are
 * touched, so running it more often than necessary costs one database query
 * and no Google API calls at all.
 *
 * Guarded by CRON_SECRET like the other scheduled jobs — or by an admin
 * session, so "sync everything now" is available to a person without handing
 * them the cron token.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !secret || request.headers.get("authorization") === `Bearer ${secret}`;

    let actorEmail: string | undefined;
    if (!fromCron) {
      const user = await getCurrentUser();
      if (!user || !(await hasCapability(user, "manage_files"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 401 });
      }
      actorEmail = user.email;
    }

    const results = await syncDueSchedules({ actorEmail });

    return NextResponse.json(
      {
        ranAt: new Date().toISOString(),
        scheduleCount: results.length,
        results: results.map((result) => ({
          scheduleId: result.scheduleId,
          status: result.status,
          created: result.created,
          updated: result.updated,
          deleted: result.deleted,
          unchanged: result.unchanged,
          issueCount: result.issues.length,
          error: result.error,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
