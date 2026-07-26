import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

/**
 * Matches items that are marked published, not admin-hidden, whose publishAt
 * gate (if any) has passed, and whose unpublishAt gate (if any) hasn't
 * passed yet.
 */
function publishedNow() {
  const now = new Date();
  return {
    published: true,
    hidden: false,
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }] },
    ],
  };
}

/**
 * Extra filter to merge alongside `publishedNow()` on guest-facing listings
 * of *videos and files*: those link straight to playable/downloadable
 * content, so member-only ones stay hidden until the viewer signs in.
 *
 * Series and categories deliberately don't use this — they list for
 * everyone, carrying a "Members" badge, and gate on their own page with a
 * login prompt (see the MemberGate on the series/category pages). Listing
 * them tells a guest the content exists without giving access to it.
 */
function guestFilter(isLoggedIn: boolean) {
  return isLoggedIn ? {} : { memberOnly: false };
}

const seriesOrder: Prisma.SeriesOrderByWithRelationInput[] = [
  { pinned: "desc" },
  { position: "asc" },
];
const categoryOrder: Prisma.CategoryOrderByWithRelationInput[] = [
  { pinned: "desc" },
  { position: "asc" },
];

/** Root-level categories (no parent) for the homepage — each may have its own series, child categories, and/or videos/files attached directly (skipping the series layer). */
export async function getPublishedCategoriesWithSeries(isLoggedIn: boolean) {
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  return prisma.category.findMany({
    // No guestFilter on categories or series (see guestFilter's note): both
    // list for guests with a "Members" badge and gate on their own page.
    // Directly-attached videos/files stay filtered.
    where: { parentId: null, ...publishedNow() },
    orderBy: categoryOrder,
    include: {
      series: { where: publishedNow(), orderBy: seriesOrder },
      children: { where: publishedNow(), orderBy: categoryOrder },
      videos: { where, orderBy: { position: "asc" } },
      files: { where, orderBy: { position: "asc" } },
    },
  });
}

/**
 * The series shown in the homepage hero banner: an explicitly featured
 * series (most recently updated), falling back to the most recently
 * updated published series with a cover image, then any published series.
 */
export async function getFeaturedSeries() {
  const where = publishedNow();

  const explicit = await prisma.series.findFirst({
    where: { ...where, featured: true },
    orderBy: { updatedAt: "desc" },
  });
  if (explicit) return explicit;

  const withCover = await prisma.series.findFirst({
    where: { ...where, coverImageUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (withCover) return withCover;

  return prisma.series.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Most recently added published series. `publicOnly` excludes member-only
 * series outright, for the public RSS feed: on-site listings show them with a
 * badge and gate on click, but a syndication feed gets republished and cached
 * elsewhere, so it stays strictly public.
 */
export async function getRecentlyAddedSeries(limit = 10, publicOnly = false) {
  return prisma.series.findMany({
    where: { ...publishedNow(), ...(publicOnly ? { memberOnly: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type RecentlyAddedItem =
  | { kind: "category"; createdAt: Date; category: RecentlyAddedCategory }
  | { kind: "series"; createdAt: Date; series: RecentlyAddedSeries };

type RecentlyAddedCategory = Awaited<ReturnType<typeof getPublishedCategoriesWithSeries>>[number];
type RecentlyAddedSeries = Awaited<ReturnType<typeof getRecentlyAddedSeries>>[number];

/**
 * Newest published categories and series interleaved by creation date, for the
 * "Recently added" listings. Kept as one chronological list rather than
 * per-type sections so "recently added" actually reads as recency.
 */
export async function getRecentlyAdded(isLoggedIn: boolean, limit = 10): Promise<RecentlyAddedItem[]> {
  const contentWhere = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  const [categories, series] = await Promise.all([
    prisma.category.findMany({
      where: publishedNow(),
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        series: { where: publishedNow(), orderBy: seriesOrder },
        children: { where: publishedNow(), orderBy: categoryOrder },
        videos: { where: contentWhere, orderBy: { position: "asc" } },
        files: { where: contentWhere, orderBy: { position: "asc" } },
      },
    }),
    getRecentlyAddedSeries(limit),
  ]);

  return [
    ...categories.map((category) => ({ kind: "category" as const, createdAt: category.createdAt, category })),
    ...series.map((s) => ({ kind: "series" as const, createdAt: s.createdAt, series: s })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
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

/** A user's playback history (in-progress and completed), most recent first, for the "Recently Played" tab. */
export async function getRecentlyPlayed(userId: string, limit = 30) {
  return prisma.watchProgress.findMany({
    where: {
      userId,
      positionSeconds: { gt: 0 },
      video: publishedNow(),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { video: { include: { series: true } } },
  });
}

export async function getCategoryBySlug(slug: string, isLoggedIn: boolean) {
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  return prisma.category.findFirst({
    // No guestFilter on the category itself (mirrors getSeriesBySlug): a memberOnly category
    // still resolves here so the page can show a MemberGate instead of a bare 404.
    where: { slug, ...publishedNow() },
    include: {
      series: { where: publishedNow(), orderBy: seriesOrder },
      videos: { where, orderBy: { position: "asc" } },
      files: { where, orderBy: { position: "asc" } },
      children: {
        // Same as the top-level listing: sub-categories stay visible (badged
        // and gated) even when member-only.
        where: publishedNow(),
        orderBy: categoryOrder,
        include: {
          series: { where: publishedNow(), orderBy: seriesOrder },
          videos: { where, orderBy: { position: "asc" } },
          files: { where, orderBy: { position: "asc" } },
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
export async function getRelatedSeries(
  series: { id: string; categoryId: string | null; tags: string[] },
  limit = 8,
) {
  const where = publishedNow();
  const byCategory = series.categoryId
    ? await prisma.series.findMany({
        where: { ...where, categoryId: series.categoryId, id: { not: series.id } },
        orderBy: seriesOrder,
        take: limit,
      })
    : [];
  if (byCategory.length >= limit || series.tags.length === 0) return byCategory.slice(0, limit);

  const byTag = await prisma.series.findMany({
    where: {
      ...where,
      id: { notIn: [series.id, ...byCategory.map((s) => s.id)] },
      tags: { hasSome: series.tags },
    },
    orderBy: seriesOrder,
    take: limit - byCategory.length,
  });
  return [...byCategory, ...byTag];
}

/** Other published, ready videos from the same series (or nearby videos if standalone), excluding itself. */
export async function getRelatedVideos(
  video: { id: string; seriesId: string | null },
  isLoggedIn: boolean,
  limit = 8,
) {
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn), status: "READY" as const };
  if (video.seriesId) {
    return prisma.video.findMany({
      where: { ...where, seriesId: video.seriesId, id: { not: video.id } },
      orderBy: { position: "asc" },
      take: limit,
      include: { series: true },
    });
  }
  return prisma.video.findMany({
    where: { ...where, id: { not: video.id } },
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
export async function searchContent(query: string, isLoggedIn: boolean) {
  const q = query.trim();
  if (!q) return { categories: [], series: [], videos: [] };
  const qLower = q.toLowerCase();
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn) };

  const [categories, seriesCandidates, videoCandidates] = await Promise.all([
    prisma.category.findMany({
      // Member-only categories and series stay findable (badged and gated),
      // matching the homepage listing.
      where: { name: { contains: q, mode: "insensitive" }, ...publishedNow() },
      orderBy: categoryOrder,
      include: {
        series: { where: publishedNow(), orderBy: seriesOrder },
        children: true,
        videos: { where, orderBy: { position: "asc" } },
        files: { where, orderBy: { position: "asc" } },
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
          where,
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

// --- Comments ----------------------------------------------------------------

export async function getComments(type: "series" | "video", id: string) {
  return prisma.comment.findMany({
    where: type === "series" ? { seriesId: id } : { videoId: id },
    include: { user: { select: { id: true, name: true, email: true, picture: true } } },
    orderBy: { createdAt: "desc" },
  });
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

export async function isCategoryInWatchLater(userId: string, categoryId: string) {
  return (
    (await prisma.categoryWatchLater.findUnique({
      where: { userId_categoryId: { userId, categoryId } },
    })) !== null
  );
}

/** A logged-in user's queued series, videos, and categories, for a "Watch Later" page. */
export async function getWatchLater(userId: string) {
  const [seriesQueue, videoQueue, categoryQueue] = await Promise.all([
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
    prisma.categoryWatchLater.findMany({
      where: { userId, category: publishedNow() },
      include: {
        category: {
          include: { series: true, children: true, videos: true, files: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { seriesQueue, videoQueue, categoryQueue };
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
 * When a series (or, for a video attached straight to a category, the
 * category itself) has `requireSequential` on, a video is locked until the
 * previous video (by position) is marked completed in the viewer's
 * WatchProgress. Anonymous viewers (no progress tracking) never get locked out.
 */
export async function isVideoLockedBySequence(
  userId: string | null,
  video: { id: string; position: number; seriesId: string | null; categoryId: string | null },
): Promise<boolean> {
  if (!userId) return false;
  if (!video.seriesId && !video.categoryId) return false;

  const requireSequential = video.seriesId
    ? (
        await prisma.series.findUnique({
          where: { id: video.seriesId },
          select: { requireSequential: true },
        })
      )?.requireSequential
    : (
        await prisma.category.findUnique({
          where: { id: video.categoryId! },
          select: { requireSequential: true },
        })
      )?.requireSequential;
  if (!requireSequential) return false;

  const previous = await prisma.video.findFirst({
    where: video.seriesId
      ? { seriesId: video.seriesId, position: { lt: video.position }, ...publishedNow() }
      : { categoryId: video.categoryId, position: { lt: video.position }, ...publishedNow() },
    orderBy: { position: "desc" },
  });
  if (!previous) return false;

  const progress = await prisma.watchProgress.findUnique({
    where: { userId_videoId: { userId, videoId: previous.id } },
  });
  return !progress?.completed;
}

/**
 * Batched version of isVideoLockedBySequence for a whole series' video list
 * (already ordered by position, already the published set) — the
 * single-video version re-queries the same series row and re-derives
 * "the previous video" from the DB for every video; here that's known from
 * the list itself, so the only query needed is one WatchProgress lookup for
 * the whole series instead of up to 3 queries per video.
 */
export async function getSequentialLockedVideoIds(
  userId: string | null,
  series: { requireSequential: boolean; videos: { id: string; position: number }[] },
): Promise<Set<string>> {
  if (!userId || !series.requireSequential || series.videos.length === 0) return new Set();

  const sorted = [...series.videos].sort((a, b) => a.position - b.position);
  const progress = await prisma.watchProgress.findMany({
    where: { userId, videoId: { in: sorted.map((v) => v.id) } },
    select: { videoId: true, completed: true },
  });
  const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.videoId));

  const locked = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    if (!completedIds.has(sorted[i - 1].id)) locked.add(sorted[i].id);
  }
  return locked;
}

// --- Subscriptions -------------------------------------------------------

export async function isSeriesSubscribed(userId: string, seriesId: string) {
  return (await prisma.subscription.findUnique({ where: { userId_seriesId: { userId, seriesId } } })) !== null;
}

export async function isCategorySubscribed(userId: string, categoryId: string) {
  return (
    (await prisma.subscription.findUnique({ where: { userId_categoryId: { userId, categoryId } } })) !== null
  );
}

/** A logged-in user's followed series and categories, for a "Subscriptions" page. */
export async function getSubscriptions(userId: string) {
  const [seriesSubs, categorySubs] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId, seriesId: { not: null }, series: publishedNow() },
      include: { series: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findMany({
      where: { userId, categoryId: { not: null } },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { seriesSubs, categorySubs };
}

/** Users subscribed to a series itself, or to its category (or an ancestor of it). */
export async function getSubscriberUserIdsForSeries(seriesId: string, categoryId: string | null): Promise<string[]> {
  const categoryChain = categoryId ? await categoryChainIds(categoryId) : [];
  const subs = await prisma.subscription.findMany({
    where: {
      OR: [{ seriesId }, ...(categoryChain.length > 0 ? [{ categoryId: { in: categoryChain } }] : [])],
    },
    select: { userId: true },
  });
  return Array.from(new Set(subs.map((s) => s.userId)));
}

/** Users subscribed to a category directly (or to an ancestor of it) — for a video/file attached straight to a category. */
export async function getSubscriberUserIdsForCategory(categoryId: string): Promise<string[]> {
  const categoryChain = await categoryChainIds(categoryId);
  const subs = await prisma.subscription.findMany({
    where: { categoryId: { in: categoryChain } },
    select: { userId: true },
  });
  return Array.from(new Set(subs.map((s) => s.userId)));
}

async function categoryChainIds(categoryId: string): Promise<string[]> {
  const ids: string[] = [];
  let currentId: string | null = categoryId;
  while (currentId) {
    ids.push(currentId);
    const category: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = category?.parentId ?? null;
  }
  return ids;
}

// --- Playlists -------------------------------------------------------------

export async function getUserPlaylists(userId: string) {
  return prisma.playlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" }, include: { video: { include: { series: true } } } } },
  });
}

export async function getPlaylist(playlistId: string, userId: string) {
  return prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    include: { items: { orderBy: { position: "asc" }, include: { video: { include: { series: true } } } } },
  });
}

/** Every playlist a user has, flagged with whether the given video is already in it (for an "Add to playlist" menu). */
export async function getUserPlaylistsWithMembership(userId: string, videoId: string) {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: { where: { videoId }, select: { id: true } } },
  });
  return playlists.map((p) => ({ id: p.id, title: p.title, hasVideo: p.items.length > 0 }));
}

// --- Reactions (likes/dislikes) ---------------------------------------------

export async function getSeriesReactionSummary(seriesId: string) {
  const [likes, dislikes] = await Promise.all([
    prisma.reaction.count({ where: { seriesId, type: "LIKE" } }),
    prisma.reaction.count({ where: { seriesId, type: "DISLIKE" } }),
  ]);
  return { likes, dislikes };
}

export async function getVideoReactionSummary(videoId: string) {
  const [likes, dislikes] = await Promise.all([
    prisma.reaction.count({ where: { videoId, type: "LIKE" } }),
    prisma.reaction.count({ where: { videoId, type: "DISLIKE" } }),
  ]);
  return { likes, dislikes };
}

export async function getUserSeriesReaction(userId: string, seriesId: string) {
  const reaction = await prisma.reaction.findUnique({ where: { userId_seriesId: { userId, seriesId } } });
  return reaction?.type ?? null;
}

export async function getUserVideoReaction(userId: string, videoId: string) {
  const reaction = await prisma.reaction.findUnique({ where: { userId_videoId: { userId, videoId } } });
  return reaction?.type ?? null;
}

// --- View events (trending + analytics) -------------------------------------

export async function logSeriesView(seriesId: string, userId: string | null) {
  await prisma.viewEvent.create({ data: { seriesId, userId } });
}

export async function logVideoView(videoId: string, userId: string | null) {
  await prisma.viewEvent.create({ data: { videoId, userId } });
}

/** Published series with the most views in the last `days` days, for a homepage "Trending" row. */
export async function getTrendingSeries(limit = 10, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await prisma.viewEvent.groupBy({
    by: ["seriesId"],
    where: { seriesId: { not: null }, createdAt: { gte: since } },
    _count: { seriesId: true },
    orderBy: { _count: { seriesId: "desc" } },
    take: limit * 2, // over-fetch since some may since be unpublished
  });
  if (grouped.length === 0) return [];

  const ids = grouped.map((g) => g.seriesId as string);
  const series = await prisma.series.findMany({
    where: { id: { in: ids }, ...publishedNow() },
  });
  const byId = new Map(series.map((s) => [s.id, s]));
  return grouped
    .map((g) => byId.get(g.seriesId as string))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .slice(0, limit);
}

/** Site-wide view totals over `days` days, for the admin analytics dashboard. */
export async function getAnalyticsSummary(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalViews, topSeriesGrouped, topVideosGrouped] = await Promise.all([
    prisma.viewEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.viewEvent.groupBy({
      by: ["seriesId"],
      where: { seriesId: { not: null }, createdAt: { gte: since } },
      _count: { seriesId: true },
      orderBy: { _count: { seriesId: "desc" } },
      take: 10,
    }),
    prisma.viewEvent.groupBy({
      by: ["videoId"],
      where: { videoId: { not: null }, createdAt: { gte: since } },
      _count: { videoId: true },
      orderBy: { _count: { videoId: "desc" } },
      take: 10,
    }),
  ]);

  const [seriesById, videosById] = await Promise.all([
    prisma.series.findMany({ where: { id: { in: topSeriesGrouped.map((g) => g.seriesId as string) } } }),
    prisma.video.findMany({ where: { id: { in: topVideosGrouped.map((g) => g.videoId as string) } } }),
  ]);
  const seriesMap = new Map(seriesById.map((s) => [s.id, s]));
  const videoMap = new Map(videosById.map((v) => [v.id, v]));

  return {
    totalViews,
    topSeries: topSeriesGrouped
      .map((g) => ({ series: seriesMap.get(g.seriesId as string), views: g._count.seriesId }))
      .filter((r): r is { series: NonNullable<typeof r.series>; views: number } => Boolean(r.series)),
    topVideos: topVideosGrouped
      .map((g) => ({ video: videoMap.get(g.videoId as string), views: g._count.videoId }))
      .filter((r): r is { video: NonNullable<typeof r.video>; views: number } => Boolean(r.video)),
  };
}

// --- Up next -----------------------------------------------------------------

/** The next published, ready video in the same series (by position), for an "Up next" panel. */
export async function getUpNextVideo(
  video: { id: string; position: number; seriesId: string | null },
  isLoggedIn: boolean,
) {
  if (!video.seriesId) return null;
  return prisma.video.findFirst({
    where: {
      seriesId: video.seriesId,
      position: { gt: video.position },
      status: "READY",
      ...publishedNow(),
      ...guestFilter(isLoggedIn),
    },
    orderBy: { position: "asc" },
    include: { series: true },
  });
}

// --- Scheduled premieres -------------------------------------------------

/**
 * A video marked as a premiere is visible (with a countdown) before its
 * publishAt time, unlike a normal scheduled video which stays fully hidden.
 * Falls back to the normal published lookup if it's not a pending premiere.
 */
export async function getVideoBySlugIncludingPremiere(slug: string) {
  const published = await prisma.video.findFirst({
    where: { slug, ...publishedNow() },
    include: { series: true },
  });
  if (published) return published;

  return prisma.video.findFirst({
    where: { slug, published: true, hidden: false, isPremiere: true, publishAt: { gt: new Date() } },
    include: { series: true },
  });
}

/** Upcoming premieres (published, isPremiere, publishAt in the future), soonest first. */
export async function getUpcomingPremieres(isLoggedIn: boolean, limit = 10) {
  return prisma.video.findMany({
    where: {
      published: true,
      hidden: false,
      isPremiere: true,
      publishAt: { gt: new Date() },
      ...guestFilter(isLoggedIn),
    },
    orderBy: { publishAt: "asc" },
    take: limit,
    include: { series: true },
  });
}

// --- Granular viewing permissions (roles + per-user grants) -----------------

type ViewerUser = { id: string; role: "MEMBER" | "ADMIN" };

async function userInAnyGroup(userId: string, groupIds: string[]): Promise<boolean> {
  if (groupIds.length === 0) return false;
  const count = await prisma.groupAssignment.count({ where: { userId, groupId: { in: groupIds } } });
  return count > 0;
}

/**
 * Whether a user can view a series: admins always can; a series with no
 * granular viewer grants falls back to the plain `memberOnly` gate; a
 * series with at least one grant (role or specific user) requires the
 * viewer to match one of those grants — `memberOnly` no longer applies.
 */
export async function canViewSeries(
  user: ViewerUser | null,
  series: { id: string; memberOnly: boolean },
): Promise<boolean> {
  if (user?.role === "ADMIN") return true;

  const [groupGrants, userGrantCount] = await Promise.all([
    prisma.seriesViewerGroup.findMany({ where: { seriesId: series.id }, select: { groupId: true } }),
    prisma.seriesViewer.count({ where: { seriesId: series.id } }),
  ]);
  const isRestricted = groupGrants.length > 0 || userGrantCount > 0;
  if (!isRestricted) return canAccess(series.memberOnly, Boolean(user));
  if (!user) return false;

  const [directGrant, inGroup] = await Promise.all([
    prisma.seriesViewer.findUnique({ where: { seriesId_userId: { seriesId: series.id, userId: user.id } } }),
    userInAnyGroup(user.id, groupGrants.map((g) => g.groupId)),
  ]);
  return Boolean(directGrant) || inGroup;
}

/** Same as canViewSeries, but for a video's own independent viewing grants. */
export async function canViewVideo(
  user: ViewerUser | null,
  video: { id: string; memberOnly: boolean },
): Promise<boolean> {
  if (user?.role === "ADMIN") return true;

  const [groupGrants, userGrantCount] = await Promise.all([
    prisma.videoViewerGroup.findMany({ where: { videoId: video.id }, select: { groupId: true } }),
    prisma.videoViewer.count({ where: { videoId: video.id } }),
  ]);
  const isRestricted = groupGrants.length > 0 || userGrantCount > 0;
  if (!isRestricted) return canAccess(video.memberOnly, Boolean(user));
  if (!user) return false;

  const [directGrant, inGroup] = await Promise.all([
    prisma.videoViewer.findUnique({ where: { videoId_userId: { videoId: video.id, userId: user.id } } }),
    userInAnyGroup(user.id, groupGrants.map((g) => g.groupId)),
  ]);
  return Boolean(directGrant) || inGroup;
}

/**
 * Batched version of canViewVideo for a whole list of videos (e.g. a
 * series' episode list) — avoids the N+1 query pattern of calling
 * canViewVideo once per video, which for a restriction check meant up to
 * 4 queries *per video*. This does at most 4 queries total regardless of
 * how many videos are passed in.
 */
export async function getViewableVideoIds(
  user: ViewerUser | null,
  videos: { id: string; memberOnly: boolean }[],
): Promise<Set<string>> {
  if (videos.length === 0) return new Set();
  if (user?.role === "ADMIN") return new Set(videos.map((v) => v.id));

  const ids = videos.map((v) => v.id);
  const [groupGrants, userGrantVideoIds] = await Promise.all([
    prisma.videoViewerGroup.findMany({ where: { videoId: { in: ids } }, select: { videoId: true, groupId: true } }),
    prisma.videoViewer.findMany({ where: { videoId: { in: ids } }, select: { videoId: true } }),
  ]);
  const restrictedIds = new Set([...groupGrants.map((g) => g.videoId), ...userGrantVideoIds.map((g) => g.videoId)]);

  const result = new Set<string>();
  const stillToCheck: typeof videos = [];
  for (const v of videos) {
    if (!restrictedIds.has(v.id)) {
      if (canAccess(v.memberOnly, Boolean(user))) result.add(v.id);
    } else {
      stillToCheck.push(v);
    }
  }
  if (stillToCheck.length === 0 || !user) return result;

  const groupIdsNeeded = Array.from(new Set(groupGrants.map((g) => g.groupId)));
  const [directGrants, memberGroupIds] = await Promise.all([
    prisma.videoViewer.findMany({
      where: { userId: user.id, videoId: { in: stillToCheck.map((v) => v.id) } },
      select: { videoId: true },
    }),
    groupIdsNeeded.length > 0
      ? prisma.groupAssignment.findMany({
          where: { userId: user.id, groupId: { in: groupIdsNeeded } },
          select: { groupId: true },
        })
      : Promise.resolve([]),
  ]);
  const directVideoIds = new Set(directGrants.map((g) => g.videoId));
  const memberGroupIdSet = new Set(memberGroupIds.map((g) => g.groupId));
  const videoGroupMap = new Map<string, string[]>();
  for (const g of groupGrants) {
    const arr = videoGroupMap.get(g.videoId) ?? [];
    arr.push(g.groupId);
    videoGroupMap.set(g.videoId, arr);
  }

  for (const v of stillToCheck) {
    if (directVideoIds.has(v.id)) {
      result.add(v.id);
      continue;
    }
    const groupsForVideo = videoGroupMap.get(v.id) ?? [];
    if (groupsForVideo.some((gid) => memberGroupIdSet.has(gid))) result.add(v.id);
  }
  return result;
}

export async function getSeriesViewerGroups(seriesId: string) {
  return prisma.seriesViewerGroup.findMany({ where: { seriesId }, include: { group: true }, orderBy: { createdAt: "asc" } });
}

export async function getSeriesViewers(seriesId: string) {
  return prisma.seriesViewer.findMany({ where: { seriesId }, include: { user: true }, orderBy: { createdAt: "asc" } });
}

export async function getVideoViewerGroups(videoId: string) {
  return prisma.videoViewerGroup.findMany({ where: { videoId }, include: { group: true }, orderBy: { createdAt: "asc" } });
}

export async function getVideoViewers(videoId: string) {
  return prisma.videoViewer.findMany({ where: { videoId }, include: { user: true }, orderBy: { createdAt: "asc" } });
}
