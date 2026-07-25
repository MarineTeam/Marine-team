import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logSeriesView, logVideoView } from "@/lib/content";

const schema = z.object({ type: z.enum(["series", "video"]), id: z.string().min(1) });

const THROTTLE_SECONDS = 30 * 60;

/**
 * Logs a ViewEvent (used for Trending + Analytics), throttled per browser
 * per item via a short-lived cookie rather than a DB read-check: a cookie
 * read is free, so a throttled repeat view costs zero Prisma operations
 * instead of trading a write for a read (which nets no savings — reads
 * count as operations too).
 *
 * Doesn't attribute the event to a user: ViewEvent.userId exists for
 * possible future use but nothing queries it today (Trending/Analytics
 * only aggregate by seriesId/videoId), so resolving the caller's identity
 * here would just be 1-2 extra Prisma operations for no benefit.
 */
export async function POST(request: NextRequest) {
  const { type, id } = schema.parse(await request.json());
  const cookieName = `ve_${type}_${id}`;

  if (request.cookies.get(cookieName)) {
    return NextResponse.json({ logged: false });
  }

  if (type === "series") {
    await logSeriesView(id, null);
  } else {
    await logVideoView(id, null);
  }

  const response = NextResponse.json({ logged: true });
  response.cookies.set(cookieName, "1", { maxAge: THROTTLE_SECONDS, path: "/", sameSite: "lax" });
  return response;
}
