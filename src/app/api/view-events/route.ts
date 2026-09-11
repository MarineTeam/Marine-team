import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { clientIpFrom } from "@/lib/authorization";
import { logSeriesView, logVideoView } from "@/lib/content";
import { prisma } from "@/lib/db";
import { windowStart } from "@/lib/rate-limit";
import { VIEW_THROTTLE_SECONDS, viewKey } from "@/lib/view-key";

const schema = z.object({ type: z.enum(["series", "video"]), id: z.string().min(1).max(60) });

/**
 * Logs a ViewEvent (used for Trending + Analytics), unauthenticated because
 * most viewers have no account.
 *
 * Throttled twice. A cookie, set here, keeps an honest browser from counting
 * the same item twice in half an hour without a database read. And a key
 * derived from the caller's address (lib/view-key.ts) does the same on the
 * server — the cookie alone was the whole throttle once, and a script that
 * simply doesn't send it could put any sermon at the top of the home page.
 *
 * Doesn't attribute the event to a user: ViewEvent.userId exists for
 * possible future use but nothing queries it today.
 */
export async function POST(request: NextRequest) {
  try {
    const { type, id } = schema.parse(await request.json());
    const cookieName = `ve_${type}_${id}`;

    if (request.cookies.get(cookieName)) {
      return NextResponse.json({ logged: false });
    }

    // The item has to exist: a made-up id used to reach the insert and fail
    // its foreign key, which came back as a 500.
    const exists =
      type === "series"
        ? await prisma.series.findUnique({ where: { id }, select: { id: true } })
        : await prisma.video.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const key = viewKey(clientIpFrom(request.headers), process.env.AUTH0_SECRET);
    const response = NextResponse.json({ logged: true });
    response.cookies.set(cookieName, "1", { maxAge: VIEW_THROTTLE_SECONDS, path: "/", sameSite: "lax" });

    if (key) {
      const recent = await prisma.viewEvent.count({
        where: {
          ipHash: key,
          ...(type === "series" ? { seriesId: id } : { videoId: id }),
          createdAt: { gte: windowStart(VIEW_THROTTLE_SECONDS) },
        },
      });
      if (recent > 0) {
        // Same answer and the same cookie as a repeat: a caller learns
        // nothing about which throttle caught them.
        const repeat = NextResponse.json({ logged: false });
        repeat.cookies.set(cookieName, "1", { maxAge: VIEW_THROTTLE_SECONDS, path: "/", sameSite: "lax" });
        return repeat;
      }
    }

    if (type === "series") {
      await logSeriesView(id, null, key);
    } else {
      await logVideoView(id, null, key);
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
