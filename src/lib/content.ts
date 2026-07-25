import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

/** Matches items that are marked published AND (have no publishAt gate, or its time has passed). */
function publishedNow() {
  return { published: true, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] };
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

/** Published series tagged with the given tag (case-insensitive, tags are stored lowercased). */
export async function getSeriesByTag(tag: string) {
  return prisma.series.findMany({
    where: { ...publishedNow(), tags: { has: tag.toLowerCase() } },
    orderBy: seriesOrder,
  });
}

/** Public search across categories, series, and videos by name/title/description/tags. */
export async function searchContent(query: string) {
  const q = query.trim();
  if (!q) return { categories: [], series: [], videos: [] };

  const [categories, series, videos] = await Promise.all([
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
              { tags: { has: q.toLowerCase() } },
            ],
          },
        ],
      },
      orderBy: seriesOrder,
      take: 20,
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
      orderBy: { position: "asc" },
      take: 20,
    }),
  ]);

  return { categories, series, videos };
}
