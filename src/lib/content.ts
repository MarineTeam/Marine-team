import { cache } from "react";
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { isPluginEnabled } from "@/lib/plugins";
import { getShareGrants } from "@/lib/share-access";
import { hymnReadingOrder } from "@/lib/hymnal";

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
    deletedAt: null,
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

// Videos and files are the two the create routes never assign a position to,
// so every row sits at the schema default of 0 until an admin reorders one.
// Position alone would leave those ties to the database to settle however it
// likes, and a category nobody has touched could come back in a different
// order on each load. createdAt second matches what the admin lists show, so
// the reorder screen and the page it is ordering agree.
const videoOrder: Prisma.VideoOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "desc" },
];
const fileOrder: Prisma.FileAssetOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "desc" },
];

/** Root-level categories (no parent) for the homepage — each may have its own series, child categories, and/or videos/files attached directly (skipping the series layer). */
async function getPublishedCategoriesWithSeriesUncached(isLoggedIn: boolean) {
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
      videos: { where, orderBy: videoOrder },
      files: { where, orderBy: fileOrder },
    },
  });
}

/** Cached: this is the homepage's top-level listing query, shared by every visitor. */
export const getPublishedCategoriesWithSeries = unstable_cache(
  getPublishedCategoriesWithSeriesUncached,
  ["published-categories-with-series"],
  { revalidate: 60, tags: ["categories", "series"] },
);

/**
 * The series shown in the homepage hero banner: an explicitly featured
 * series (most recently updated), falling back to the most recently
 * updated published series with a cover image, then any published series.
 */
async function getFeaturedSeriesUncached() {
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

/** Cached: the homepage hero banner is the same for every visitor. */
export const getFeaturedSeries = unstable_cache(getFeaturedSeriesUncached, ["featured-series"], {
  revalidate: 60,
  tags: ["series"],
});

/**
 * Most recently added published series. `publicOnly` excludes member-only
 * series outright, for the public RSS feed: on-site listings show them with a
 * badge and gate on click, but a syndication feed gets republished and cached
 * elsewhere, so it stays strictly public.
 */
async function getRecentlyAddedSeriesUncached(limit = 10, publicOnly = false) {
  return prisma.series.findMany({
    where: { ...publishedNow(), ...(publicOnly ? { memberOnly: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Cached: shared across every visitor and the public RSS feed. */
export const getRecentlyAddedSeries = unstable_cache(
  getRecentlyAddedSeriesUncached,
  ["recently-added-series"],
  { revalidate: 60, tags: ["series"] },
);

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
async function getRecentlyAddedUncached(isLoggedIn: boolean, limit = 10): Promise<RecentlyAddedItem[]> {
  const contentWhere = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  const [categories, series] = await Promise.all([
    prisma.category.findMany({
      where: publishedNow(),
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        series: { where: publishedNow(), orderBy: seriesOrder },
        children: { where: publishedNow(), orderBy: categoryOrder },
        videos: { where: contentWhere, orderBy: videoOrder },
        files: { where: contentWhere, orderBy: fileOrder },
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

/** Cached: shared across every visitor of a given login state, for the "Recently added" listings. */
export const getRecentlyAdded = unstable_cache(getRecentlyAddedUncached, ["recently-added"], {
  revalidate: 60,
  tags: ["categories", "series"],
});

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

// Wrapped in React's cache() rather than a plain async function: this is
// called once from the page component and again from generateMetadata (see
// src/app/categories/[slug]/page.tsx) — cache() dedupes those into one query
// per request instead of two, the same pattern getCurrentUser/getShareGrants
// already use.
export const getCategoryBySlug = cache(async function getCategoryBySlug(slug: string, isLoggedIn: boolean) {
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  return prisma.category.findFirst({
    // No guestFilter on the category itself (mirrors getSeriesBySlug): a memberOnly category
    // still resolves here so the page can show a MemberGate instead of a bare 404.
    where: { slug, ...publishedNow() },
    include: {
      // A hymnalStyle category grids each series as a book (or a shelf of
      // them), which needs to know how many PDFs it holds and which one to
      // draw a cover from — hence the files here. See lib/hymnal.ts;
      // harmless for other categories, which read only the series rows.
      series: {
        where: publishedNow(),
        orderBy: seriesOrder,
        include: { files: { where, orderBy: fileOrder } },
      },
      videos: { where, orderBy: videoOrder },
      files: { where, orderBy: fileOrder },
      children: {
        // Same as the top-level listing: sub-categories stay visible (badged
        // and gated) even when member-only.
        where: publishedNow(),
        orderBy: categoryOrder,
        include: {
          series: { where: publishedNow(), orderBy: seriesOrder },
          videos: { where, orderBy: videoOrder },
          files: { where, orderBy: fileOrder },
          children: true,
        },
      },
      parent: true,
    },
  });
});

export async function getUncategorizedSeries() {
  return prisma.series.findMany({
    where: { ...publishedNow(), categoryId: null },
    orderBy: seriesOrder,
  });
}

// Wrapped in React's cache() rather than a plain async function: this is
// called once from the page component and again from generateMetadata (see
// src/app/series/[slug]/page.tsx) — cache() dedupes those into one query per
// request instead of two, the same pattern getCurrentUser/getShareGrants
// already use.
export const getSeriesBySlug = cache(async function getSeriesBySlug(slug: string) {
  return prisma.series.findFirst({
    where: { slug, ...publishedNow() },
    include: {
      category: true,
      videos: { where: publishedNow(), orderBy: videoOrder },
      files: { where: publishedNow(), orderBy: fileOrder },
    },
  });
});

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
      orderBy: videoOrder,
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
 * Trigram similarity (pg_trgm, 0-1) below which a fuzzy candidate is
 * discarded as too dissimilar to be a useful "did you mean" result.
 */
const FUZZY_SIMILARITY_THRESHOLD = 0.25;

/**
 * Trigram-ranked series ids matching `q` by title similarity, computed in
 * Postgres (via the GIN trigram indexes from the search_trigram_indexes
 * migration) rather than pulling candidate rows into memory — this is the
 * fuzzy fallback used when the exact/substring pass finds nothing. Series
 * list for every viewer regardless of memberOnly (badged, gated on their own
 * page), matching the exact-match query above, so there's no guest filter here.
 */
async function fuzzySeriesIds(q: string, limit: number): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Series"
    WHERE published = true AND hidden = false
      AND ("publishAt" IS NULL OR "publishAt" <= ${now})
      AND ("unpublishAt" IS NULL OR "unpublishAt" > ${now})
      AND similarity(title, ${q}) > ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY similarity(title, ${q}) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

/** Same as fuzzySeriesIds, but for videos — which do apply the guest filter (member-only videos link straight to playable content). */
async function fuzzyVideoIds(q: string, isLoggedIn: boolean, limit: number): Promise<string[]> {
  const now = new Date();
  const memberOnlyClause = isLoggedIn ? Prisma.empty : Prisma.sql`AND "memberOnly" = false`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Video"
    WHERE published = true AND hidden = false AND status = 'READY'
      AND ("publishAt" IS NULL OR "publishAt" <= ${now})
      AND ("unpublishAt" IS NULL OR "unpublishAt" > ${now})
      ${memberOnlyClause}
      AND similarity(title, ${q}) > ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY similarity(title, ${q}) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

export type SearchFilters = {
  /** Restrict videos (and series, via their own or their series' category) to this category. */
  categoryId?: string;
  /** Restrict videos to this speaker. */
  speakerId?: string;
  sort?: "relevance" | "newest";
};

/** Category and speaker options for the /search filter selects. */
export async function getSearchFilterOptions() {
  const [categories, speakers] = await Promise.all([
    prisma.category.findMany({ where: publishedNow(), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.speaker.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { categories, speakers };
}

/**
 * Public search across categories, series, and videos by name/title/
 * description/tags/speaker, ranked by relevance rather than database order —
 * an exact/prefix title match outranks a description-only hit. Optional
 * `filters` narrow by category/speaker and switch relevance for recency.
 */
export async function searchContent(query: string, isLoggedIn: boolean, filters: SearchFilters = {}) {
  const q = query.trim();
  if (!q) return { categories: [], series: [], videos: [] };
  const qLower = q.toLowerCase();
  const where = { ...publishedNow(), ...guestFilter(isLoggedIn) };
  const transcriptsOn = await isPluginEnabled("transcripts");
  const sort = filters.sort ?? "relevance";

  const seriesCategoryFilter: Prisma.SeriesWhereInput = filters.categoryId ? { categoryId: filters.categoryId } : {};
  const videoCategoryFilter: Prisma.VideoWhereInput = filters.categoryId
    ? { OR: [{ categoryId: filters.categoryId }, { series: { categoryId: filters.categoryId } }] }
    : {};
  const videoSpeakerFilter: Prisma.VideoWhereInput = filters.speakerId ? { speakerId: filters.speakerId } : {};

  const [categories, seriesCandidates, videoCandidates] = await Promise.all([
    filters.categoryId || filters.speakerId
      ? Promise.resolve([])
      : prisma.category.findMany({
          // Member-only categories and series stay findable (badged and gated),
          // matching the homepage listing.
          where: { name: { contains: q, mode: "insensitive" }, ...publishedNow() },
          orderBy: categoryOrder,
          include: {
            series: { where: publishedNow(), orderBy: seriesOrder },
            children: true,
            videos: { where, orderBy: videoOrder },
            files: { where, orderBy: fileOrder },
          },
          take: 20,
        }),
    filters.speakerId
      ? Promise.resolve([])
      : prisma.series.findMany({
          where: {
            AND: [
              publishedNow(),
              seriesCategoryFilter,
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
          videoCategoryFilter,
          videoSpeakerFilter,
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              ...(transcriptsOn ? [{ transcript: { contains: q, mode: "insensitive" as const } }] : []),
              { speaker: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
        ],
      },
      include: { series: true, speaker: true },
      take: 50,
    }),
  ]);

  let series = seriesCandidates
    .map((s) => ({ item: s, score: relevanceScore(q, s.title, s.description) + (s.tags.includes(qLower) ? 15 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => r.item);

  let videos = videoCandidates
    .map((v) => ({
      item: v,
      score:
        relevanceScore(q, v.title, v.description) + (v.speaker?.name.toLowerCase().includes(qLower) ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => r.item);

  // The exact/substring search above finds nothing on a typo ("chruch" never
  // matches "Church" via `contains`). Only kicks in when that pass came back
  // empty, so the common case pays no extra query — ranked in Postgres via
  // pg_trgm (fuzzySeriesIds/fuzzyVideoIds) rather than an in-memory scan.
  if (series.length === 0 && !filters.speakerId) {
    const ids = await fuzzySeriesIds(q, 20);
    if (ids.length > 0) {
      const rows = await prisma.series.findMany({ where: { id: { in: ids }, ...seriesCategoryFilter } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      series = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    }
  }
  if (videos.length === 0) {
    const ids = await fuzzyVideoIds(q, isLoggedIn, 20);
    if (ids.length > 0) {
      const rows = await prisma.video.findMany({
        where: { id: { in: ids }, ...videoCategoryFilter, ...videoSpeakerFilter },
        include: { series: true, speaker: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      videos = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    }
  }

  if (sort === "newest") {
    series = [...series].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    videos = [...videos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return { categories, series, videos };
}

// --- Comments ----------------------------------------------------------------

/**
 * Top-level comments (newest first) with their replies nested underneath
 * (oldest first, reading like a conversation) — threading is one level deep,
 * so a reply's own `replies` array is always empty.
 */
/** Public reads exclude hidden comments (moderator-hidden via /admin/comments); a moderator reviews those from the queue instead. */
export async function getComments(type: "series" | "video", id: string) {
  const all = await prisma.comment.findMany({
    where: { ...(type === "series" ? { seriesId: id } : { videoId: id }), hidden: false },
    include: { user: { select: { id: true, name: true, displayName: true, email: true, picture: true } } },
    orderBy: { createdAt: "asc" },
  });

  const repliesByParent = new Map<string, typeof all>();
  for (const c of all) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  return all
    .filter((c) => !c.parentId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((c) => ({ ...c, replies: repliesByParent.get(c.id) ?? [] }));
}

/** Records a member's report of a comment; a repeat report from the same member is a no-op (unique per commentId+userId). */
export async function reportComment(commentId: string, userId: string): Promise<void> {
  await prisma.commentReport.upsert({
    where: { commentId_userId: { commentId, userId } },
    create: { commentId, userId },
    update: {},
  });
}

/**
 * Comments with at least one report or already hidden, for the
 * /admin/comments moderation queue — newest report/comment first.
 * `categoryIds`/`seriesIds` scope the query to a non-site-wide moderator
 * (undefined means no scoping, i.e. site-wide access).
 */
export async function getReportedComments(scope?: { categoryIds: string[]; seriesIds: string[] }) {
  const comments = await prisma.comment.findMany({
    where: { OR: [{ reports: { some: {} } }, { hidden: true }] },
    include: {
      user: { select: { id: true, name: true, displayName: true, email: true } },
      series: { select: { id: true, title: true, slug: true, categoryId: true } },
      video: {
        select: {
          id: true,
          title: true,
          slug: true,
          seriesId: true,
          categoryId: true,
          series: { select: { categoryId: true } },
        },
      },
      _count: { select: { reports: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!scope) return comments;
  const categorySet = new Set(scope.categoryIds);
  const seriesSet = new Set(scope.seriesIds);
  return comments.filter((c) => {
    const categoryId = c.series?.categoryId ?? c.video?.categoryId ?? c.video?.series?.categoryId ?? null;
    const seriesId = c.seriesId ?? c.video?.seriesId ?? null;
    return (categoryId != null && categorySet.has(categoryId)) || (seriesId != null && seriesSet.has(seriesId));
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

/**
 * The newest active announcement visible to a viewer of the given login
 * state, respecting its optional publishAt/expiresAt scheduling window and
 * audience targeting (ALL/GUESTS/MEMBERS).
 */
async function getActiveAnnouncementUncached(isLoggedIn: boolean) {
  const now = new Date();
  return prisma.announcement.findFirst({
    where: {
      active: true,
      audience: isLoggedIn ? { in: ["ALL", "MEMBERS"] } : { in: ["ALL", "GUESTS"] },
      AND: [
        { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Cached per login state (guest vs. member): the audience-targeted banner is the same across every visitor sharing that state. */
export const getActiveAnnouncement = unstable_cache(getActiveAnnouncementUncached, ["active-announcement"], {
  revalidate: 60,
  tags: ["announcements"],
});

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

/** Users subscribed (and not muted) to a series itself, or to its category (or an ancestor of it). */
export async function getSubscriberUserIdsForSeries(seriesId: string, categoryId: string | null): Promise<string[]> {
  const categoryChain = categoryId ? await categoryChainIds(categoryId) : [];
  const subs = await prisma.subscription.findMany({
    where: {
      muted: false,
      OR: [{ seriesId }, ...(categoryChain.length > 0 ? [{ categoryId: { in: categoryChain } }] : [])],
    },
    select: { userId: true },
  });
  return Array.from(new Set(subs.map((s) => s.userId)));
}

/** Users subscribed (and not muted) to a category directly (or to an ancestor of it) — for a video/file attached straight to a category. */
export async function getSubscriberUserIdsForCategory(categoryId: string): Promise<string[]> {
  const categoryChain = await categoryChainIds(categoryId);
  const subs = await prisma.subscription.findMany({
    where: { categoryId: { in: categoryChain }, muted: false },
    select: { userId: true },
  });
  return Array.from(new Set(subs.map((s) => s.userId)));
}

/**
 * A category's own id plus every ancestor's id, walking up via parentId.
 * One recursive query instead of one round trip per level of nesting.
 * The depth cap is a defensive bound, not an expected limit — category
 * nesting shouldn't cycle, but a raw SQL recursion has no built-in stop.
 */
export async function categoryChainIds(categoryId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, "parentId", 1 AS depth
      FROM "Category"
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c."parentId", chain.depth + 1
      FROM "Category" c
      JOIN chain ON c.id = chain."parentId"
      WHERE chain.depth < 50
    )
    SELECT id FROM chain
  `;
  return rows.map((r) => r.id);
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

/** A read-only view of someone else's playlist, for /playlists/[id] when the viewer isn't its owner — only resolves if the owner made it public. */
export async function getPublicPlaylist(playlistId: string) {
  return prisma.playlist.findFirst({
    where: { id: playlistId, public: true },
    include: {
      user: { select: { name: true, displayName: true, email: true } },
      items: { orderBy: { position: "asc" }, include: { video: { include: { series: true } } } },
    },
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
async function getTrendingSeriesUncached(limit = 10, days = 7) {
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

/** Cached: an aggregate over the last `days` days, doesn't need per-request freshness. */
export const getTrendingSeries = unstable_cache(getTrendingSeriesUncached, ["trending-series"], {
  revalidate: 300,
});

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

  const topVideoIds = topVideosGrouped.map((g) => g.videoId as string);
  const [seriesById, videosById, progressTotal, progressCompleted] = await Promise.all([
    prisma.series.findMany({ where: { id: { in: topSeriesGrouped.map((g) => g.seriesId as string) } } }),
    prisma.video.findMany({ where: { id: { in: topVideoIds } } }),
    prisma.watchProgress.groupBy({
      by: ["videoId"],
      where: { videoId: { in: topVideoIds }, updatedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.watchProgress.groupBy({
      by: ["videoId"],
      where: { videoId: { in: topVideoIds }, updatedAt: { gte: since }, completed: true },
      _count: { _all: true },
    }),
  ]);
  const seriesMap = new Map(seriesById.map((s) => [s.id, s]));
  const videoMap = new Map(videosById.map((v) => [v.id, v]));
  // Fraction of this window's watchers who reached the end, per video —
  // reuses the same heartbeat data that already powers "Continue watching"
  // and resume-on-return, so this costs one extra groupBy pair, not a new
  // tracking mechanism.
  const totalByVideo = new Map(progressTotal.map((g) => [g.videoId, g._count._all]));
  const completedByVideo = new Map(progressCompleted.map((g) => [g.videoId, g._count._all]));

  return {
    totalViews,
    topSeries: topSeriesGrouped
      .map((g) => ({ series: seriesMap.get(g.seriesId as string), views: g._count.seriesId }))
      .filter((r): r is { series: NonNullable<typeof r.series>; views: number } => Boolean(r.series)),
    topVideos: topVideosGrouped
      .map((g) => {
        const video = videoMap.get(g.videoId as string);
        const total = totalByVideo.get(g.videoId as string) ?? 0;
        const completed = completedByVideo.get(g.videoId as string) ?? 0;
        return {
          video,
          views: g._count.videoId,
          completionRate: total > 0 ? completed / total : null,
        };
      })
      .filter(
        (r): r is { video: NonNullable<typeof r.video>; views: number; completionRate: number | null } =>
          Boolean(r.video),
      ),
  };
}

// --- Recommendations -----------------------------------------------------

/**
 * A "Because you watched X" row for the homepage: anchored on the series of
 * the user's most recently watched video (any progress, not just
 * in-progress ones), then reusing getRelatedSeries' same-category/shared-tag
 * logic. Returns null if the user has no watch history yet, or their most
 * recent watch was a standalone video with no series to anchor on.
 */
export async function getRecommendedSeries(userId: string, limit = 8) {
  const recent = await prisma.watchProgress.findFirst({
    where: { userId, positionSeconds: { gt: 0 }, video: { seriesId: { not: null } } },
    orderBy: { updatedAt: "desc" },
    include: { video: { include: { series: true } } },
  });
  const anchor = recent?.video.series;
  if (!anchor) return null;

  const series = await getRelatedSeries(anchor, limit);
  if (series.length === 0) return null;
  return { anchorTitle: anchor.title, series };
}

// --- Homepage rows -----------------------------------------------------------

/** Built-in row types, in their out-of-the-box order — used both to seed HomeRow and as the fallback when nothing's been configured yet. */
const DEFAULT_HOME_ROW_TYPES: Array<"CONTINUE_WATCHING" | "RECOMMENDATIONS" | "TRENDING" | "RECENTLY_ADDED"> = [
  "CONTINUE_WATCHING",
  "RECOMMENDATIONS",
  "TRENDING",
  "RECENTLY_ADDED",
];

/** Creates the four built-in row types (enabled, in their default order) the first time /admin/home-rows is opened. A no-op once any HomeRow exists. */
export async function ensureHomeRowsSeeded(): Promise<void> {
  const count = await prisma.homeRow.count();
  if (count > 0) return;
  await prisma.homeRow.createMany({
    data: DEFAULT_HOME_ROW_TYPES.map((type, position) => ({ type, position })),
  });
}

/**
 * Enabled homepage rows in admin-configured order, each carrying its
 * category (for a CATEGORY row). Falls back to the default built-in order
 * (nothing customized yet) rather than an empty homepage when no HomeRow
 * has been created, matching how getPluginStates() fails open.
 */
async function getHomeRowsUncached() {
  const rows = await prisma.homeRow.findMany({
    where: { enabled: true },
    orderBy: { position: "asc" },
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  if (rows.length > 0) return rows;
  const now = new Date();
  return DEFAULT_HOME_ROW_TYPES.map((type, position) => ({
    id: `default-${type}`,
    type,
    title: null,
    enabled: true,
    position,
    categoryId: null,
    category: null,
    tag: null,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Cached: the homepage row config is the same for every visitor and rarely changes. */
export const getHomeRows = unstable_cache(getHomeRowsUncached, ["home-rows"], {
  revalidate: 60,
  tags: ["home-rows"],
});

/** Published series directly in a category, for a custom CATEGORY homepage row. */
export async function getCategoryRowSeries(categoryId: string) {
  return prisma.series.findMany({ where: { categoryId, ...publishedNow() }, orderBy: seriesOrder });
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
    orderBy: videoOrder,
    include: { series: true },
  });
}

// --- Sitemap -----------------------------------------------------------------

/**
 * Everything a public sitemap should list: published categories and series
 * (both list publicly with a "Members" badge even when memberOnly, per
 * guestFilter's note above), guest-visible videos (memberOnly ones excluded,
 * same as public video listings), and every distinct series tag.
 */
export async function getSitemapData() {
  const [categories, series, videos, speakers] = await Promise.all([
    prisma.category.findMany({ where: publishedNow(), select: { slug: true, updatedAt: true } }),
    prisma.series.findMany({ where: publishedNow(), select: { slug: true, updatedAt: true, tags: true } }),
    prisma.video.findMany({
      where: { ...publishedNow(), memberOnly: false, status: "READY" },
      select: { slug: true, updatedAt: true, scriptureRefs: true },
    }),
    prisma.speaker.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const tagSet = new Set<string>();
  for (const s of series) {
    for (const t of s.tags) tagSet.add(t);
  }
  const bookSet = new Set<string>();
  for (const v of videos) {
    for (const ref of v.scriptureRefs) bookSet.add(scriptureBook(ref));
  }

  return {
    categories,
    series,
    videos,
    tags: Array.from(tagSet),
    speakers,
    scriptureBooks: Array.from(bookSet),
  };
}

// --- Trash (soft-deleted content) -------------------------------------------

/** Every soft-deleted category/series/video/file, newest-deleted first, for /admin/trash. */
export async function getTrashedItems() {
  const [categories, series, videos, files] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } }),
    prisma.series.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.video.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { series: { select: { title: true } }, category: { select: { name: true } } },
    }),
    prisma.fileAsset.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { series: { select: { title: true } }, category: { select: { name: true } } },
    }),
  ]);
  return { categories, series, videos, files };
}

// --- Slug aliases ------------------------------------------------------------

/** Records a series/video's previous slug so an old link can redirect to its current one — a no-op if oldSlug === newSlug. */
export async function recordSlugAlias(type: "SERIES" | "VIDEO", oldSlug: string, newSlug: string, targetId: string) {
  if (oldSlug === newSlug) return;
  await prisma.slugAlias.upsert({
    where: { type_oldSlug: { type, oldSlug } },
    create: { type, oldSlug, targetId },
    update: { targetId, createdAt: new Date() },
  });
}

/** The current slug of the (still-existing, non-deleted) series a stale slug used to point at, or null. */
export async function resolveSeriesSlugAlias(oldSlug: string): Promise<string | null> {
  const alias = await prisma.slugAlias.findUnique({ where: { type_oldSlug: { type: "SERIES", oldSlug } } });
  if (!alias) return null;
  const series = await prisma.series.findFirst({
    where: { id: alias.targetId, deletedAt: null },
    select: { slug: true },
  });
  return series?.slug ?? null;
}

/** Same as resolveSeriesSlugAlias, for videos. */
export async function resolveVideoSlugAlias(oldSlug: string): Promise<string | null> {
  const alias = await prisma.slugAlias.findUnique({ where: { type_oldSlug: { type: "VIDEO", oldSlug } } });
  if (!alias) return null;
  const video = await prisma.video.findFirst({
    where: { id: alias.targetId, deletedAt: null },
    select: { slug: true },
  });
  return video?.slug ?? null;
}

// --- Sermon notes ------------------------------------------------------------

/** A member's own notes on a video, oldest timestamp first — private, never shown to anyone else. */
export async function getSermonNotes(userId: string, videoId: string) {
  return prisma.sermonNote.findMany({
    where: { userId, videoId },
    orderBy: { timestampSeconds: "asc" },
  });
}

// --- Chapters ----------------------------------------------------------------

export async function getVideoChapters(videoId: string) {
  return prisma.chapter.findMany({ where: { videoId }, orderBy: { position: "asc" } });
}

// --- Speakers ------------------------------------------------------------

export async function getSpeakers() {
  return prisma.speaker.findMany({ orderBy: { position: "asc" } });
}

// Wrapped in React's cache() rather than a plain async function: this is
// called once from the page component and again from generateMetadata (see
// src/app/speakers/[slug]/page.tsx) — cache() dedupes those into one query
// per request instead of two, the same pattern getCurrentUser/getShareGrants
// already use.
/** A speaker plus their published, viewable videos, for /speakers/[slug]. */
export const getSpeakerBySlug = cache(async function getSpeakerBySlug(slug: string, isLoggedIn: boolean) {
  const speaker = await prisma.speaker.findUnique({ where: { slug } });
  if (!speaker) return null;
  const videos = await prisma.video.findMany({
    where: { speakerId: speaker.id, status: "READY", ...publishedNow(), ...guestFilter(isLoggedIn) },
    orderBy: { createdAt: "desc" },
    include: { series: true },
  });
  return { speaker, videos };
});

// --- Scripture references -------------------------------------------------

/**
 * Leading book name of a reference like "1 John 3:16-18" -> "1 John", or
 * "Psalm 23" -> "Psalm". Best-effort: strips a trailing chapter (and
 * optional verse/range) token, falling back to the whole string when there
 * isn't one, since admins enter these as free text.
 */
export function scriptureBook(ref: string): string {
  const trimmed = ref.trim();
  const match = trimmed.match(/^(.*?)\s+\d+(?::\d+(?:-\d+)?)?$/);
  return (match ? match[1] : trimmed).trim();
}

/** Distinct scripture books referenced by published, viewable videos, for a /scripture index. */
export async function getScriptureBooks(isLoggedIn: boolean): Promise<string[]> {
  const videos = await prisma.video.findMany({
    where: { status: "READY", scriptureRefs: { isEmpty: false }, ...publishedNow(), ...guestFilter(isLoggedIn) },
    select: { scriptureRefs: true },
  });
  const books = new Set<string>();
  for (const v of videos) {
    for (const ref of v.scriptureRefs) books.add(scriptureBook(ref));
  }
  return Array.from(books).sort();
}

/** Published, viewable videos whose scriptureRefs include a reference to the given book (case-insensitive). */
export async function getVideosByScriptureBook(book: string, isLoggedIn: boolean) {
  const videos = await prisma.video.findMany({
    where: { status: "READY", scriptureRefs: { isEmpty: false }, ...publishedNow(), ...guestFilter(isLoggedIn) },
    orderBy: { createdAt: "desc" },
    include: { series: true },
  });
  const target = book.toLowerCase();
  return videos.filter((v) => v.scriptureRefs.some((ref) => scriptureBook(ref).toLowerCase() === target));
}

// --- Live streaming --------------------------------------------------------

async function getCurrentLiveStreamUncached() {
  const now = new Date();
  return prisma.liveStream.findFirst({
    where: { published: true, startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] },
    orderBy: { startAt: "desc" },
  });
}

/** Cached briefly: shared across every visitor, but shouldn't lag far behind the actual start/end time. */
export const getCurrentLiveStream = unstable_cache(getCurrentLiveStreamUncached, ["current-live-stream"], {
  revalidate: 30,
  tags: ["live-streams"],
});

async function getNextLiveStreamUncached() {
  return prisma.liveStream.findFirst({
    where: { published: true, startAt: { gt: new Date() } },
    orderBy: { startAt: "asc" },
  });
}

/** Cached: the next scheduled stream, for a countdown on /live when nothing is live right now. */
export const getNextLiveStream = unstable_cache(getNextLiveStreamUncached, ["next-live-stream"], {
  revalidate: 60,
  tags: ["live-streams"],
});

// --- Scheduled premieres -------------------------------------------------

/**
 * A video marked as a premiere is visible (with a countdown) before its
 * publishAt time, unlike a normal scheduled video which stays fully hidden.
 * Falls back to the normal published lookup if it's not a pending premiere.
 *
 * Wrapped in React's cache() rather than a plain async function: this is
 * called once from the page component and again from generateMetadata (see
 * src/app/videos/[slug]/page.tsx) — cache() dedupes those into one query per
 * request instead of two, the same pattern getCurrentUser/getShareGrants
 * already use.
 */
export const getVideoBySlugIncludingPremiere = cache(async function getVideoBySlugIncludingPremiere(slug: string) {
  const published = await prisma.video.findFirst({
    where: { slug, ...publishedNow() },
    include: { series: true },
  });
  if (published) return published;

  return prisma.video.findFirst({
    where: { slug, published: true, hidden: false, isPremiere: true, publishAt: { gt: new Date() } },
    include: { series: true },
  });
});

/** Upcoming premieres (published, isPremiere, publishAt in the future), soonest first. */
async function getUpcomingPremieresUncached(isLoggedIn: boolean, limit = 10) {
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

/** Cached: shared across every visitor of a given login state. */
export const getUpcomingPremieres = unstable_cache(getUpcomingPremieresUncached, ["upcoming-premieres"], {
  revalidate: 60,
});

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
 *
 * A redeemed share link (see src/lib/share-links.ts) is a third way in,
 * checked first because it's the cheapest and applies to logged-out
 * visitors too: it's how a link handed to someone outside the site lets
 * them watch without an account.
 */
export async function canViewSeries(
  user: ViewerUser | null,
  series: { id: string; memberOnly: boolean },
): Promise<boolean> {
  if (user?.role === "ADMIN") return true;
  if ((await getShareGrants()).seriesIds.has(series.id)) return true;

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
  if ((await getShareGrants()).videoIds.has(video.id)) return true;

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
 * A published file plus whatever it hangs off, for the reader and the
 * content route. Returns null for a file that's unpublished, scheduled,
 * expired, or trashed — the same `publishedNow()` gate every public listing
 * applies, so a direct link can't reach one either.
 */
export const getReadableFile = cache(async function getReadableFile(id: string) {
  return prisma.fileAsset.findFirst({
    where: { id, ...publishedNow() },
    include: {
      // categoryId comes along so callers can scope a plugin check to the
      // section a file sits in — a file on a series inherits that series'
      // category, which is the level plugin overrides are set at.
      series: {
        select: {
          id: true,
          title: true,
          slug: true,
          memberOnly: true,
          categoryId: true,
          // For the book credit on a hymn's page (e.g. "GSFH1 · God's Family Hymnal 1").
          abbreviation: true,
        },
      },
      category: { select: { id: true, name: true, slug: true, memberOnly: true } },
    },
  });
});

export type ReadableFile = NonNullable<Awaited<ReturnType<typeof getReadableFile>>>;

/**
 * The hymn before and after this one in its book, for the arrows on a hymn's
 * page — the equivalent, for a book whose files are its hymns, of stepping
 * through a single PDF's contents in the reader.
 *
 * Only answers for a `hymnPerFile` series: anywhere else the files sitting
 * beside this one are a series' attachments, not a sequence anybody reads in
 * order. Steps in `hymnReadingOrder`, the same order the book's own list
 * shows, and skips hymns this viewer can't open so "next" always leads
 * somewhere they can go.
 */
export const getAdjacentHymns = cache(async function getAdjacentHymns(
  fileId: string,
  seriesId: string | null,
  isLoggedIn: boolean,
) {
  const nowhere = { previous: null, next: null };
  if (!seriesId) return nowhere;

  const series = await prisma.series.findFirst({
    where: { id: seriesId, hymnPerFile: true, ...publishedNow() },
    select: {
      files: {
        where: { ...publishedNow(), ...guestFilter(isLoggedIn) },
        orderBy: fileOrder,
        select: { id: true, title: true, pageNumber: true },
      },
    },
  });
  if (!series) return nowhere;

  const hymns = hymnReadingOrder(series.files);
  const at = hymns.findIndex((hymn) => hymn.id === fileId);
  // -1 covers the hymn this viewer can't see itself (a member-only hymn read
  // through a share link, say): the neighbours of a place in the list it
  // isn't in would be guesswork.
  if (at === -1) return nowhere;
  return { previous: hymns[at - 1] ?? null, next: hymns[at + 1] ?? null };
});

/**
 * Whether this viewer may read a file's *bytes*.
 *
 * Deliberately stricter than the `canAccess(file.memberOnly, ...)` check
 * FileList does. That one runs on a page which is itself already gated, so a
 * file sitting inside a members-only series inherits that page's protection
 * without needing its own flag. A direct URL has no such page in front of it,
 * so the parent has to be re-checked here — otherwise every file in a
 * members-only series would be readable by anyone holding the id.
 */
export async function canViewFile(user: ViewerUser | null, file: ReadableFile): Promise<boolean> {
  if (user?.role === "ADMIN") return true;
  if (!canAccess(file.memberOnly, Boolean(user))) return false;
  // A file on a series defers to that series' full grant logic (share links
  // and per-viewer grants included); one straight on a category only has the
  // category's own member-only flag to answer to, matching the category page.
  if (file.series) return canViewSeries(user, file.series);
  if (file.category) return canAccess(file.category.memberOnly, Boolean(user));
  return true;
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
  const [groupGrants, userGrantVideoIds, shareGrants] = await Promise.all([
    prisma.videoViewerGroup.findMany({ where: { videoId: { in: ids } }, select: { videoId: true, groupId: true } }),
    prisma.videoViewer.findMany({ where: { videoId: { in: ids } }, select: { videoId: true } }),
    getShareGrants(),
  ]);
  const restrictedIds = new Set([...groupGrants.map((g) => g.videoId), ...userGrantVideoIds.map((g) => g.videoId)]);

  const result = new Set<string>();
  const stillToCheck: typeof videos = [];
  for (const v of videos) {
    // A redeemed share link settles it either way, and works logged out —
    // so it's checked before the restriction/memberOnly split below.
    if (shareGrants.videoIds.has(v.id)) {
      result.add(v.id);
    } else if (!restrictedIds.has(v.id)) {
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

/**
 * The top-level categories, name and slug only, for the navigation chrome.
 *
 * Deliberately not getPublishedCategoriesWithSeries: that one pulls every
 * series, child, video and file underneath each category for the homepage,
 * and the sidebar renders on every single page. This is the same rows with
 * none of the weight.
 */
async function getNavCategoriesUncached() {
  return prisma.category.findMany({
    where: { parentId: null, ...publishedNow() },
    orderBy: categoryOrder,
    // hymnalStyle so the nav can badge a hymnal section with a book rather
    // than a folder — see lib/nav.ts.
    select: { id: true, name: true, slug: true, hymnalStyle: true },
  });
}

/** Cached: the same list for every visitor, on every page. */
export const getNavCategories = unstable_cache(getNavCategoriesUncached, ["nav-categories"], {
  revalidate: 300,
  tags: ["categories"],
});
