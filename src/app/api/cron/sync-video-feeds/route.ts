import { NextRequest, NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron-guard";
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
  const refused = cronGuard(request);
  if (refused) return refused;
  return NextResponse.json({ ranAt: new Date().toISOString(), feeds: await syncAllFeeds() });
}
