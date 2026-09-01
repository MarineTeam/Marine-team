import { prisma } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { publishedNow } from "@/lib/content";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import type { FeedVideo } from "@/lib/tv-feed";
import { videoThumbnailUrl } from "@/lib/video-source";

/**
 * The videos a television platform may be told about.
 *
 * The `memberOnly: false` here is the safety argument for this whole feature,
 * not a convenience. A feed is fetched by Roku's servers with no session,
 * cached by them and republished to every television that installs the
 * channel; there is no login to put in front of it. So "who can see this" has
 * exactly one honest answer - everybody - and anything members-only must never
 * reach this query.
 *
 * `publishedNow()` on top of that gives the same publish/hide/schedule rules
 * the website itself uses, so unpublishing a sermon takes it off the
 * television at the next crawl.
 */
export const FEED_LIMIT = 200;

export async function feedVideos(): Promise<FeedVideo[]> {
  const videos = await prisma.video.findMany({
    where: { ...publishedNow(), memberOnly: false, status: "READY" },
    orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
    take: FEED_LIMIT,
    include: {
      series: { select: { title: true, memberOnly: true, language: true } },
      speaker: { select: { name: true } },
    },
  });

  return (
    videos
      // A public video inside a members-only series is not public: the series
      // is what a member has to sign in to reach, and the episode inherits
      // that. The website already gates this way; the feed must agree.
      .filter((video) => !video.series?.memberOnly)
      .map((video) => ({
        id: video.id,
        slug: video.slug,
        title: video.title,
        description: video.description,
        durationSeconds: video.durationSeconds,
        source: video.source,
        externalId: video.externalId,
        externalUrl: video.externalUrl,
        createdAt: video.createdAt,
        publishAt: video.publishAt,
        language: video.language ?? video.series?.language ?? null,
        thumbnailUrl: videoThumbnailUrl(video),
        seriesTitle: video.series?.title ?? null,
        speakerName: video.speaker?.name ?? null,
      }))
  );
}

/** What the feed calls the church, and what language it is mostly in. */
export async function feedIdentity() {
  const branding = await getBranding();
  return {
    providerName: branding.name,
    baseUrl: process.env.APP_BASE_URL ?? "",
    language: DEFAULT_LOCALE,
  };
}
