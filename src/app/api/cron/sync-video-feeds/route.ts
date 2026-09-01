import { NextRequest, NextResponse } from "next/server";
import { syncAllFeeds } from "@/lib/video-feed-sync";

/**
 * Imports whatever is new on every switched-on feed.
 *
 * Daily, which is what the hosting plan allows and what a church that streams
 * on Sunday actually needs. A feed whose payload hasn't changed does no writes
 * and no second API call at all, so most nights this costs one request per
 * feed.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), feeds: await syncAllFeeds() });
}
