import { NextResponse } from "next/server";
import { isPluginEnabled } from "@/lib/plugins";
import { mrssFeed } from "@/lib/tv-feed";
import { feedIdentity, feedVideos } from "@/lib/tv-feed-query";

/**
 * The same catalogue as MRSS, which is what most other television platforms
 * and search integrations take.
 *
 * Built from the same query as the JSON on purpose: two feeds of one library
 * disagreeing about what exists is the failure nobody notices until a viewer
 * reports a missing sermon - and cached the same way, at the edge rather than
 * at build time. See the JSON feed for why that distinction matters.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isPluginEnabled("tv"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const identity = await feedIdentity();
  return new NextResponse(mrssFeed(await feedVideos(), identity), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
