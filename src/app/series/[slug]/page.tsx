import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSeriesBySlug,
  getRelatedSeries,
  isSeriesFavorited,
  isSeriesInWatchLater,
  isSeriesSubscribed,
  incrementSeriesViewCount,
  logSeriesView,
  isVideoLockedBySequence,
  canViewSeries,
  canViewVideo,
  canAccess,
} from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { FavoriteButton } from "@/components/favorite-button";
import { WatchLaterButton } from "@/components/watch-later-button";
import { SubscribeButton } from "@/components/subscribe-button";
import { StarRating } from "@/components/star-rating";
import { ReactionButtons } from "@/components/reaction-buttons";
import { ShareButtons } from "@/components/share-buttons";
import { SeriesTile } from "@/components/series-tile";
import { CommentSection } from "@/components/comment-section";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [series, user] = await Promise.all([getSeriesBySlug(slug), getCurrentUser()]);

  if (!series) notFound();

  const isLoggedIn = Boolean(user);
  const hasAudio = series.files.some((f) => f.mimeType?.startsWith("audio/"));
  const [
    favorited,
    queued,
    subscribed,
    related,
    favoritesOn,
    commentsOn,
    relatedOn,
    ratingsOn,
    watchLaterOn,
    viewCountsOn,
    socialShareOn,
    subscriptionsOn,
    likesOn,
    canModerate,
    lockedVideoIds,
    seriesLocked,
    viewableVideoIds,
  ] = await Promise.all([
    user ? isSeriesFavorited(user.id, series.id) : Promise.resolve(false),
    user ? isSeriesInWatchLater(user.id, series.id) : Promise.resolve(false),
    user ? isSeriesSubscribed(user.id, series.id) : Promise.resolve(false),
    getRelatedSeries(series),
    isPluginEnabled("favorites", series.categoryId),
    isPluginEnabled("comments", series.categoryId),
    isPluginEnabled("related-content", series.categoryId),
    isPluginEnabled("ratings", series.categoryId),
    isPluginEnabled("watch-later", series.categoryId),
    isPluginEnabled("view-counts", series.categoryId),
    isPluginEnabled("social-share", series.categoryId),
    isPluginEnabled("subscriptions", series.categoryId),
    isPluginEnabled("likes-dislikes", series.categoryId),
    user
      ? hasCapability(user, "moderate_comments", { categoryId: series.categoryId })
      : Promise.resolve(false),
    series.requireSequential
      ? Promise.all(
          series.videos.map(async (v) => [v.id, await isVideoLockedBySequence(user?.id ?? null, v)] as const),
        ).then((entries) => new Set(entries.filter(([, locked]) => locked).map(([id]) => id)))
      : Promise.resolve(new Set<string>()),
    canViewSeries(user, series).then((allowed) => !allowed),
    Promise.all(series.videos.map(async (v) => [v.id, await canViewVideo(user, v)] as const)).then(
      (entries) => new Set(entries.filter(([, allowed]) => allowed).map(([id]) => id)),
    ),
  ]);

  if (viewCountsOn) {
    await incrementSeriesViewCount(series.id);
    await logSeriesView(series.id, user?.id ?? null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
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
            {ratingsOn && <StarRating type="series" id={series.id} canRate={Boolean(user)} />}
            {likesOn && <ReactionButtons type="series" id={series.id} canReact={Boolean(user)} />}
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
            <section>
              <h2 className="text-lg font-semibold mb-3">Videos</h2>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {series.videos.map((video) => {
                  const locked = !viewableVideoIds.has(video.id);
                  const sequenceLocked = lockedVideoIds.has(video.id);
                  return (
                    <li key={video.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">{video.title}</p>
                        {video.description && (
                          <p className="text-sm text-zinc-500 line-clamp-1">
                            {video.description}
                          </p>
                        )}
                        {video.status !== "READY" && (
                          <p className="text-xs text-amber-600 mt-1">Processing…</p>
                        )}
                        {sequenceLocked && (
                          <p className="text-xs text-zinc-400 mt-1">Watch the previous episode first</p>
                        )}
                      </div>
                      {locked ? (
                        <span className="text-sm text-zinc-400">Members only</span>
                      ) : sequenceLocked ? (
                        <span className="text-sm text-zinc-400">🔒 Locked</span>
                      ) : (
                        <Link
                          href={`/videos/${video.slug}`}
                          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
                        >
                          Watch
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {series.files.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Files</h2>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {series.files.map((file) => {
                  const locked = !canAccess(file.memberOnly, isLoggedIn);
                  const isAudio = file.mimeType?.startsWith("audio/") ?? false;
                  return (
                    <li key={file.id} className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium">{file.title}</span>
                        {locked ? (
                          <span className="text-sm text-zinc-400">Members only</span>
                        ) : (
                          !isAudio && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              Download
                            </a>
                          )
                        )}
                      </div>
                      {!locked && isAudio && (
                        <audio controls src={file.url} className="w-full">
                          Your browser does not support the audio element.
                        </audio>
                      )}
                    </li>
                  );
                })}
              </ul>
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
