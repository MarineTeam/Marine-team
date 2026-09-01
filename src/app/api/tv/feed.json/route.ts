import { NextResponse } from "next/server";
import { isPluginEnabled } from "@/lib/plugins";
import { rokuFeed } from "@/lib/tv-feed";
import { feedIdentity, feedVideos } from "@/lib/tv-feed-query";

/**
 * The catalogue, in the shape Roku's Direct Publisher reads.
 *
 * Point a Direct Publisher channel at this URL and Roku builds and ships a
 * real television channel from it - no BrightScript, no app to maintain. It
 * is also the honest answer to "can you make us a TV app": most of one, with
 * nothing to install.
 *
 * Cached for an hour **at the edge**, by the header, rather than by Next's
 * `revalidate`. That distinction matters: `revalidate` on a route with no
 * dynamic input makes Next prerender it at build time, so the feed would ship
 * carrying whatever the build machine's database held - which in CI is
 * nothing. `force-dynamic` plus `s-maxage` gets the same one-fetch-an-hour
 * behaviour from the CDN while always being generated from the live database.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isPluginEnabled("tv"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const identity = await feedIdentity();
  return NextResponse.json(rokuFeed(await feedVideos(), identity), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
