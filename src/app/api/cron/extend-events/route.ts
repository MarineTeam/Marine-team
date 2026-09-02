import { NextRequest, NextResponse } from "next/server";
import { extendAllSeries } from "@/lib/event-series-query";

/**
 * Pushes every repeating event's horizon forward by a day.
 *
 * A series is stored as a rule and materialised six months out, so this is what
 * stops the far end ever arriving: without it, a weekly Bible study would
 * quietly stop appearing half a year after somebody set it up, and the first
 * anyone would know is a member asking where it went.
 *
 * Once a day, which is what the hosting plan allows (see vercel.json). A missed
 * run costs nothing — the next one generates the same dates, because generating
 * is idempotent.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const result = await extendAllSeries();
  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
