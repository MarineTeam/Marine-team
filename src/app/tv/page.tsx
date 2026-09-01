import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TvShell, type TvRow } from "@/components/tv-shell";
import { getBranding } from "@/lib/branding";
import { publishedNow } from "@/lib/content";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { videoEmbedUrl, videoThumbnailUrl } from "@/lib/video-source";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Television",
  robots: { index: false, follow: false },
};

/**
 * The screen a television points its browser at.
 *
 * This is the TV app that needs nothing installed: Samsung and LG sets have
 * browsers, a Chromecast will hold a page open, and anything with an HDMI
 * stick can be pointed here. It is also the fastest honest answer to "can we
 * have this on the telly" - no store review, no separate codebase.
 *
 * Public content only, like the feeds and for a related reason: a television
 * in a church hall is not signed in as anybody, and the sign-in that exists
 * (see /link) is for a member's own set at home rather than a shared screen.
 */
export default async function TvPage() {
  if (!(await isPluginEnabled("tv"))) notFound();

  const [branding, series] = await Promise.all([
    getBranding(),
    prisma.series.findMany({
      where: { ...publishedNow(), memberOnly: false },
      orderBy: [{ pinned: "desc" }, { position: "asc" }],
      take: 8,
      include: {
        videos: {
          where: { ...publishedNow(), memberOnly: false, status: "READY" },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
      },
    }),
  ]);

  const rows: TvRow[] = series
    .filter((one) => one.videos.length > 0)
    .map((one) => ({
      title: one.title,
      items: one.videos.map((video) => ({
        id: video.id,
        title: video.title,
        subtitle: null,
        thumbnailUrl: videoThumbnailUrl(video),
        embedUrl: videoEmbedUrl(video),
      })),
    }));

  return <TvShell rows={rows} siteName={branding.name} />;
}
