import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { truncateDescription, siteUrl } from "@/lib/seo";
import { jsonLdScriptProps, breadcrumbListJsonLd, type BreadcrumbItem } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getSeriesBySlug,
  resolveSeriesSlugAlias,
  getRelatedSeries,
  isSeriesFavorited,
  isSeriesInWatchLater,
  isSeriesSubscribed,
  incrementSeriesViewCount,
  getSequentialLockedVideoIds,
  canViewSeries,
  getViewableVideoIds,
  getSeriesRatingSummary,
  getUserSeriesRating,
  getSeriesReactionSummary,
  getUserSeriesReaction,
  getComments,
} from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { getShareOptions } from "@/lib/share-links";
import { getPluginStates } from "@/lib/plugins";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { FavoriteButton } from "@/components/favorite-button";
import { WatchLaterButton } from "@/components/watch-later-button";
import { SubscribeButton } from "@/components/subscribe-button";
import { StarRating } from "@/components/star-rating";
import { ReactionButtons } from "@/components/reaction-buttons";
import { ShareButtons } from "@/components/share-buttons";
import { ShareLinkPanel } from "@/components/share-link-panel";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { FileList } from "@/components/file-list";
import { HymnalBookGrid } from "@/components/hymnal-book-grid";
import { BookContents } from "@/components/book-contents";
import { HymnList } from "@/components/hymn-list";
import { fileBook, pdfsOf } from "@/lib/hymnal";
import { CommentSection } from "@/components/comment-section";
import { ViewEventBeacon } from "@/components/view-event-beacon";

/**
 * Mirrors the page body's own restraint: a member-only series the current
 * visitor can't view gets a generic title and no thumbnail here too, rather
 * than letting link-preview metadata leak more than the page itself shows.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [series, user] = await Promise.all([getSeriesBySlug(slug), getCurrentUser()]);
  if (!series) return {};

  if (!(await canViewSeries(user, series))) {
    return { title: "Members Only", description: "This series is for members only." };
  }

  const description = series.description
    ? truncateDescription(series.description)
    : `Watch ${series.title} on Marine Team.`;
  const firstVideo = series.videos[0];
  const thumbnailUrl =
    series.coverImageUrl ??
    (firstVideo ? bunnyStreamThumbnailUrl(firstVideo.bunnyVideoId, firstVideo.thumbnailFileName) || undefined : undefined);

  return {
    title: series.title,
    description,
    openGraph: {
      title: series.title,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
    twitter: {
      card: thumbnailUrl ? "summary_large_image" : "summary",
      title: series.title,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
  };
}

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [series, user] = await Promise.all([getSeriesBySlug(slug), getCurrentUser()]);

  if (!series) {
    const currentSlug = await resolveSeriesSlugAlias(slug);
    if (currentSlug) permanentRedirect(`/series/${currentSlug}`);
    notFound();
  }

  const isLoggedIn = Boolean(user);
  const hasAudio = series.files.some((f) => f.mimeType?.startsWith("audio/"));
  // In a hymnalStyle category this series is one of three things (see
  // lib/hymnal.ts): a book whose files are its own hymns (hymnPerFile), a
  // book that is one whole PDF, or a shelf of several. Anything left over
  // that isn't a PDF still lists underneath as a plain download.
  const hymnalStyle = Boolean(series.category?.hymnalStyle);
  const hymnPerFile = hymnalStyle && series.hymnPerFile;
  const bookPdfs = hymnalStyle && !hymnPerFile ? pdfsOf(series.files) : [];
  const soleBook = bookPdfs.length === 1 ? bookPdfs[0] : null;
  const soleBookLocked = Boolean(soleBook?.memberOnly) && !isLoggedIn;
  const otherFiles =
    hymnalStyle && !hymnPerFile
      ? series.files.filter((file) => !bookPdfs.some((pdf) => pdf.id === file.id))
      : series.files;
  const [
    favorited,
    queued,
    subscribed,
    plugins,
    canModerate,
    lockedVideoIds,
    seriesLocked,
    viewableVideoIds,
  ] = await Promise.all([
    user ? isSeriesFavorited(user.id, series.id) : Promise.resolve(false),
    user ? isSeriesInWatchLater(user.id, series.id) : Promise.resolve(false),
    user ? isSeriesSubscribed(user.id, series.id) : Promise.resolve(false),
    getPluginStates(series.categoryId),
    user
      ? hasCapability(user, "moderate_comments", { categoryId: series.categoryId })
      : Promise.resolve(false),
    getSequentialLockedVideoIds(user?.id ?? null, series),
    canViewSeries(user, series).then((allowed) => !allowed),
    getViewableVideoIds(user, series.videos),
  ]);
  const {
    favorites: favoritesOn,
    comments: commentsOn,
    "related-content": relatedOn,
    ratings: ratingsOn,
    "watch-later": watchLaterOn,
    "view-counts": viewCountsOn,
    "social-share": socialShareOn,
    subscriptions: subscriptionsOn,
    "likes-dislikes": likesOn,
    "share-links": shareLinksOn,
    "book-reader": readerOn,
  } = plugins;

  const [ratingSummary, myRating, reactionSummary, myReaction, related, comments, shareOptions] = await Promise.all([
    ratingsOn ? getSeriesRatingSummary(series.id) : Promise.resolve({ average: 0, count: 0 }),
    ratingsOn && user ? getUserSeriesRating(user.id, series.id) : Promise.resolve(null),
    likesOn ? getSeriesReactionSummary(series.id) : Promise.resolve({ likes: 0, dislikes: 0 }),
    likesOn && user ? getUserSeriesReaction(user.id, series.id) : Promise.resolve(null),
    relatedOn && !seriesLocked ? getRelatedSeries(series) : Promise.resolve([]),
    commentsOn && !seriesLocked ? getComments("series", series.id) : Promise.resolve([]),
    shareLinksOn && !seriesLocked
      ? getShareOptions(user, {
          type: "series",
          id: series.id,
          memberOnly: series.memberOnly,
          categoryId: series.categoryId,
        })
      : Promise.resolve({ canShare: false, targetIsRestricted: false, canGrantAccess: false }),
  ]);
  const initialComments = comments.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    replies: c.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }));

  // Gated by seriesLocked to match the ViewEventBeacon below and the video
  // page, where the access check returns early: someone who only ever sees
  // the members-only gate hasn't viewed the series.
  if (viewCountsOn && !seriesLocked) await incrementSeriesViewCount(series.id);

  // Also gated by seriesLocked: a visitor who can't view the series doesn't
  // get structured data (or the visible breadcrumb below) describing it
  // either, matching MemberGate's restraint.
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    ...(series.category ? [{ label: series.category.name, href: `/categories/${series.category.slug}` }] : []),
    { label: series.title },
  ];
  const breadcrumbJsonLd = breadcrumbListJsonLd(breadcrumbItems, siteUrl);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {!seriesLocked && <script {...jsonLdScriptProps(breadcrumbJsonLd)} />}
      {!seriesLocked && <Breadcrumbs items={breadcrumbItems} />}
      {viewCountsOn && !seriesLocked && <ViewEventBeacon type="series" id={series.id} />}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{series.title}</h1>
          {!seriesLocked && (
            <div className="flex flex-wrap items-center gap-2">
              {user && favoritesOn && (
                <FavoriteButton type="series" id={series.id} initialFavorited={favorited} />
              )}
              {user && watchLaterOn && (
                <WatchLaterButton type="series" id={series.id} initialQueued={queued} />
              )}
              {user && subscriptionsOn && (
                <SubscribeButton type="series" id={series.id} initialSubscribed={subscribed} />
              )}
            </div>
          )}
        </div>
        {series.description && <p className="mt-2 text-zinc-500">{series.description}</p>}
        {!seriesLocked && (ratingsOn || viewCountsOn || likesOn) && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {ratingsOn && (
              <StarRating
                type="series"
                id={series.id}
                canRate={Boolean(user)}
                initial={{ ...ratingSummary, mine: myRating }}
              />
            )}
            {likesOn && (
              <ReactionButtons
                type="series"
                id={series.id}
                canReact={Boolean(user)}
                initial={{ ...reactionSummary, mine: myReaction }}
              />
            )}
            {viewCountsOn && (
              <span className="text-sm text-zinc-500">
                {series.viewCount + 1} view{series.viewCount === 0 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        {!seriesLocked && socialShareOn && (
          <div className="mt-3">
            <ShareButtons title={series.title} path={`/series/${series.slug}`} />
          </div>
        )}
        {shareOptions.canShare && (
          <div className="mt-3">
            <ShareLinkPanel seriesId={series.id} canGrantAccess={shareOptions.canGrantAccess} />
          </div>
        )}
        {series.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {series.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tags/${encodeURIComponent(tag)}`}
                className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
        {hasAudio && (
          <a
            href={`/series/${series.slug}/podcast.xml`}
            className="mt-3 inline-block text-xs text-zinc-500 hover:underline"
          >
            Podcast RSS feed
          </a>
        )}
      </div>

      {seriesLocked ? (
        <MemberGate />
      ) : (
        <>
          {series.videos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Videos</h2>
              <div className="space-y-3">
                {series.videos.map((video) => {
                  const locked = !viewableVideoIds.has(video.id);
                  const sequenceLocked = lockedVideoIds.has(video.id);
                  // The video page re-checks access and sequential locking, so a
                  // locked episode still links through and explains itself there
                  // rather than being a dead row — same as the category page.
                  const badge = locked
                    ? "Members"
                    : sequenceLocked
                      ? "🔒 Locked"
                      : video.status !== "READY"
                        ? "Processing"
                        : undefined;
                  return (
                    <MenuTile
                      key={video.id}
                      href={`/videos/${video.slug}`}
                      title={video.title}
                      subtitle={
                        sequenceLocked ? "Watch the previous episode first" : video.description
                      }
                      thumbnailUrl={bunnyStreamThumbnailUrl(
                        video.bunnyVideoId,
                        video.thumbnailFileName,
                      )}
                      badge={badge}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {series.files.length > 0 && (
            <section className="space-y-3">
              {hymnPerFile ? (
                <HymnList hymns={series.files} isLoggedIn={isLoggedIn} />
              ) : hymnalStyle ? (
                <>
                  {soleBook ? (
                    soleBookLocked ? (
                      <p className="text-sm text-zinc-500">This book is for members only.</p>
                    ) : (
                      <BookContents fileId={soleBook.id} readerOn={readerOn} />
                    )
                  ) : (
                    bookPdfs.length > 0 && (
                      <HymnalBookGrid books={bookPdfs.map((pdf) => fileBook(pdf, isLoggedIn))} />
                    )
                  )}
                  {otherFiles.length > 0 && (
                    <>
                      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                        {bookPdfs.length > 0 ? "Other files" : "Files"}
                      </h2>
                      <FileList files={otherFiles} isLoggedIn={isLoggedIn} readerOn={readerOn} />
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Files</h2>
                  <FileList files={series.files} isLoggedIn={isLoggedIn} readerOn={readerOn} />
                </>
              )}
            </section>
          )}

          {series.videos.length === 0 && series.files.length === 0 && (
            <p className="text-zinc-500">Nothing published in this series yet.</p>
          )}
        </>
      )}

      {!seriesLocked && relatedOn && related.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
            More like this
          </h2>
          <div className="space-y-3">
            {related.map((s) => (
              <SeriesTile key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}

      {!seriesLocked && commentsOn && (
        <CommentSection
          type="series"
          id={series.id}
          currentUserId={user?.id ?? null}
          canModerate={canModerate}
          initialComments={initialComments}
        />
      )}
    </div>
  );
}

function MemberGate() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
      <p className="font-medium">This series is for members only.</p>
      <a
        href="/auth/login"
        className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
      >
        Log in to view
      </a>
    </div>
  );
}
