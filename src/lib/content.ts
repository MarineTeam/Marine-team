import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

/**
 * Matches items that are marked published, whose publishAt gate (if any) has
 * passed, and whose unpublishAt gate (if any) hasn't passed yet.
 */
function publishedNow() {
  const now = new Date();
  return {
    published: true,
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }] },
    ],
  };
}

const seriesOrder: Prisma.SeriesOrderByWithRelationInput[] = [
  { pinned: "desc" },
  { position: "asc" },
];
const categoryOrder: Prisma.CategoryOrderByWithRelationInput[] = [
  { pinned: "desc" },
  { position: "asc" },
];

/** Root-level categories (no parent) for the homepage — each may have its own series and/or child categories. */
export async function getPublishedCategoriesWithSeries() {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: categoryOrder,
    include: {
      series: { where: publishedNow(), orderBy: seriesOrder },
      children: { orderBy: categoryOrder },
    },
  });
}

/**
 * The series shown in the homepage hero banner: an explicitly featured
 * series (most recently updated), falling back to the most recently
 * updated published series with a cover image, then any published series.
 */
export async function getFeaturedSeries() {
  const explicit = await prisma.series.findFirst({
    where: { ...publishedNow(), featured: true },
    orderBy: { updatedAt: "desc" },
  });
  if (explicit) return explicit;

  const withCover = await prisma.series.findFirst({
    where: { ...publishedNow(), coverImageUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (withCover) return withCover;

  return prisma.series.findFirst({
    where: publishedNow(),
    orderBy: { updatedAt: "desc" },
  });
}

/** Most recently added published series, for a homepage "Recently added" row. */
export async function getRecentlyAddedSeries(limit = 10) {
  return prisma.series.findMany({
    where: publishedNow(),
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** In-progress videos for a logged-in user, for a "Continue watching" row. */
export async function getContinueWatching(userId: string, limit = 10) {
  const progress = await prisma.watchProgress.findMany({
    where: {
      userId,
      completed: false,
      positionSeconds: { gt: 0 },
      video: publishedNow(),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { video: { include: { series: true } } },
  });
  return progress;
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findFirst({
    where: { slug },
    include: {
      series: { where: publishedNow(), orderBy: seriesOrder },
      children: {
        orderBy: categoryOrder,
        include: {
          series: { where: publishedNow(), orderBy: seriesOrder },
          children: true,
        },
      },
      parent: true,
    },
  });
}

export async function getUncategorizedSeries() {
  return prisma.series.findMany({
    where: { ...publishedNow(), categoryId: null },
    orderBy: seriesOrder,
  });
}

export async function getSeriesBySlug(slug: string) {
  return prisma.series.findFirst({
    where: { slug, ...publishedNow() },
    include: {
      category: true,
      videos: { where: publishedNow(), orderBy: { position: "asc" } },
      files: { where: publishedNow(), orderBy: { position: "asc" } },
    },
  });
}

/**
 * Other published series worth surfacing alongside the given one: same
 * category first, then anything sharing a tag, capped at `limit` and never
 * including the series itself.
 */
export async function getRelatedSeries(series: { id: string; categoryId: string | null; tags: string[] }, limit = 8) {
  const byCategory = series.categoryId
    ? await prisma.series.findMany({
        where: { ...publishedNow(), categoryId: series.categoryId, id: { not: series.id } },
        orderBy: seriesOrder,
        take: limit,
      })
    : [];
  if (byCategory.length >= limit || series.tags.length === 0) return byCategory.slice(0, limit);

  const byTag = await prisma.series.findMany({
    where: {
      ...publishedNow(),
      id: { notIn: [series.id, ...byCategory.map((s) => s.id)] },
      tags: { hasSome: series.tags },
    },
    orderBy: seriesOrder,
    take: limit - byCategory.length,
  });
  return [...byCategory, ...byTag];
}

/** Other published, ready videos from the same series (or nearby videos if standalone), excluding itself. */
export async function getRelatedVideos(video: { id: string; seriesId: string | null }, limit = 8) {
  if (video.seriesId) {
    return prisma.video.findMany({
      where: { ...publishedNow(), status: "READY", seriesId: video.seriesId, id: { not: video.id } },
      orderBy: { position: "asc" },
      take: limit,
      include: { series: true },
    });
  }
  return prisma.video.findMany({
    where: { ...publishedNow(), status: "READY", id: { not: video.id } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { series: true },
  });
}

export async function getVideoBySlug(slug: string) {
  return prisma.video.findFirst({
    where: { slug, ...publishedNow() },
    include: { series: true },
  });
}

export async function getWatchProgressForVideo(userId: string, videoId: string) {
  return prisma.watchProgress.findUnique({
    where: { userId_videoId: { userId, videoId } },
  });
}

export async function isSeriesFavorited(userId: string, seriesId: string) {
  return (await prisma.seriesFavorite.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  })) !== null;
}

export async function isVideoFavorited(userId: string, videoId: string) {
  return (await prisma.videoFavorite.findUnique({
    where: { userId_videoId: { userId, videoId } },
  })) !== null;
}

/** A logged-in user's bookmarked series and videos, for a "My Favorites" page. */
export async function getFavorites(userId: string) {
  const [seriesFavorites, videoFavorites] = await Promise.all([
    prisma.seriesFavorite.findMany({
      where: { userId, series: publishedNow() },
      include: { series: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.videoFavorite.findMany({
      where: { userId, video: publishedNow() },
      include: { video: { include: { series: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { seriesFavorites, videoFavorites };
}

/** Published series tagged with the given tag (case-insensitive, tags are stored lowercased). */
export async function getSeriesByTag(tag: string) {
  return prisma.series.findMany({
    where: { ...publishedNow(), tags: { has: tag.toLowerCase() } },
    orderBy: seriesOrder,
  });
}

/**
 * Relevance score for a title/description match: an exact title match ranks
 * highest, then a title starting with the query, then any title match, then
 * a description-only match. Higher is more relevant.
 */
function relevanceScore(q: string, title: string, description?: string | null): number {
  const query = q.toLowerCase();
  const t = title.toLowerCase();
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.includes(query)) return 60;
  if (description?.toLowerCase().includes(query)) return 30;
  return 10;
}

/**
 * Public search across categories, series, and videos by name/title/
 * description/tags, ranked by relevance rather than database order —
 * an exact/prefix title match outranks a description-only hit.
 */
export async function searchContent(query: string) {
  const q = query.trim();
  if (!q) return { categories: [], series: [], videos: [] };
  const qLower = q.toLowerCase();

  const [categories, seriesCandidates, videoCandidates] = await Promise.all([
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: categoryOrder,
      include: {
        series: { where: publishedNow(), orderBy: seriesOrder },
        children: true,
      },
      take: 20,
    }),
    prisma.series.findMany({
      where: {
        AND: [
          publishedNow(),
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { tags: { has: qLower } },
            ],
          },
        ],
      },
      take: 50,
    }),
    prisma.video.findMany({
      where: {
        AND: [
          publishedNow(),
          { status: "READY" },
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      include: { series: true },
      take: 50,
    }),
  ]);

  const series = seriesCandidates
    .map((s) => ({ item: s, score: relevanceScore(q, s.title, s.description) + (s.tags.includes(qLower) ? 15 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => r.item);

  const videos = videoCandidates
    .map((v) => ({ item: v, score: relevanceScore(q, v.title, v.description) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => r.item);

  return { categories, series, videos };
}

// --- Ratings ---------------------------------------------------------------

export async function getSeriesRatingSummary(seriesId: string) {
  const agg = await prisma.rating.aggregate({
    where: { seriesId },
    _avg: { value: true },
    _count: { value: true },
  });
  return { average: agg._avg.value ?? 0, count: agg._count.value };
}

export async function getVideoRatingSummary(videoId: string) {
  const agg = await prisma.rating.aggregate({
    where: { videoId },
    _avg: { value: true },
    _count: { value: true },
  });
  return { average: agg._avg.value ?? 0, count: agg._count.value };
}

export async function getUserSeriesRating(userId: string, seriesId: string) {
  const rating = await prisma.rating.findUnique({ where: { userId_seriesId: { userId, seriesId } } });
  return rating?.value ?? null;
}

export async function getUserVideoRating(userId: string, videoId: string) {
  const rating = await prisma.rating.findUnique({ where: { userId_videoId: { userId, videoId } } });
  return rating?.value ?? null;
}

// --- Watch later -------------------------------------------------------------

export async function isSeriesInWatchLater(userId: string, seriesId: string) {
  return (
    (await prisma.seriesWatchLater.findUnique({ where: { userId_seriesId: { userId, seriesId } } })) !== null
  );
}

export async function isVideoInWatchLater(userId: string, videoId: string) {
  return (
    (await prisma.videoWatchLater.findUnique({ where: { userId_videoId: { userId, videoId } } })) !== null
  );
}

/** A logged-in user's queued series and videos, for a "Watch Later" page. */
export async function getWatchLater(userId: string) {
  const [seriesQueue, videoQueue] = await Promise.all([
    prisma.seriesWatchLater.findMany({
      where: { userId, series: publishedNow() },
      include: { series: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.videoWatchLater.findMany({
      where: { userId, video: publishedNow() },
      include: { video: { include: { series: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { seriesQueue, videoQueue };
}

// --- View counts -------------------------------------------------------------

export async function incrementSeriesViewCount(seriesId: string) {
  await prisma.series.update({ where: { id: seriesId }, data: { viewCount: { increment: 1 } } });
}

export async function incrementVideoViewCount(videoId: string) {
  await prisma.video.update({ where: { id: videoId }, data: { viewCount: { increment: 1 } } });
}

// --- Announcements -----------------------------------------------------------

export async function getActiveAnnouncement() {
  return prisma.announcement.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
}

// --- Sequential unlock -------------------------------------------------------

/**
 * When a series has `requireSequential` on, a video is locked until the
 * previous video (by position) is marked completed in the viewer's
 * WatchProgress. Anonymous viewers (no progress tracking) never get locked out.
 */
export async function isVideoLockedBySequence(
  userId: string | null,
  video: { id: string; position: number; seriesId: string | null },
): Promise<boolean> {
  if (!userId || !video.seriesId) return false;
  const series = await prisma.series.findUnique({
    where: { id: video.seriesId },
    select: { requireSequential: true },
  });
  if (!series?.requireSequential) return false;

  const previous = await prisma.video.findFirst({
    where: { seriesId: video.seriesId, position: { lt: video.position }, ...publishedNow() },
    orderBy: { position: "desc" },
  });
  if (!previous) return false;

  const progress = await prisma.watchProgress.findUnique({
    where: { userId_videoId: { userId, videoId: previous.id } },
  });
  return !progress?.completed;
}
