import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getVideoBySlugIncludingPremiere,
  getWatchProgressForVideo,
  getRelatedVideos,
  getUpNextVideo,
  isVideoFavorited,
  isVideoInWatchLater,
  isSeriesSubscribed,
  incrementVideoViewCount,
  logVideoView,
  isVideoLockedBySequence,
  canViewVideo,
} from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { bunnyStreamEmbedUrl, bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { WatchProgressTracker } from "@/components/watch-progress-tracker";
import { FavoriteButton } from "@/components/favorite-button";
import { WatchLaterButton } from "@/components/watch-later-button";
import { SubscribeButton } from "@/components/subscribe-button";
import { AddToPlaylistButton } from "@/components/add-to-playlist-button";
import { StarRating } from "@/components/star-rating";
import { ReactionButtons } from "@/components/reaction-buttons";
import { ShareButtons } from "@/components/share-buttons";
import { MenuTile } from "@/components/menu-tile";
import { CommentSection } from "@/components/comment-section";
import { UpNextPanel } from "@/components/up-next-panel";
import { PremiereCountdown } from "@/components/premiere-countdown";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [video, user] = await Promise.all([getVideoBySlugIncludingPremiere(slug), getCurrentUser()]);

  if (!video) notFound();

  const isPendingPremiere = Boolean(video.isPremiere && video.publishAt && video.publishAt > new Date());

  if (!(await canViewVideo(user, video))) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">
          {user ? "You don't have access to this video." : "This video is for members only."}
        </p>
        {!user && (
          <a
            href="/auth/login"
            className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Log in to watch
          </a>
        )}
      </div>
    );
  }

  const categoryId = video.series?.categoryId ?? null;
  const [
    progress,
    favorited,
    queued,
    subscribed,
    related,
    upNext,
    favoritesOn,
    commentsOn,
    relatedOn,
    ratingsOn,
    watchLaterOn,
    viewCountsOn,
    socialShareOn,
    subscriptionsOn,
    playlistsOn,
    likesOn,
    upNextOn,
    canModerate,
    sequenceLocked,
  ] = await Promise.all([
    user ? getWatchProgressForVideo(user.id, video.id) : Promise.resolve(null),
    user ? isVideoFavorited(user.id, video.id) : Promise.resolve(false),
    user ? isVideoInWatchLater(user.id, video.id) : Promise.resolve(false),
    user && video.seriesId ? isSeriesSubscribed(user.id, video.seriesId) : Promise.resolve(false),
    getRelatedVideos(video),
    getUpNextVideo(video),
    isPluginEnabled("favorites", categoryId),
    isPluginEnabled("comments", categoryId),
    isPluginEnabled("related-content", categoryId),
    isPluginEnabled("ratings", categoryId),
    isPluginEnabled("watch-later", categoryId),
    isPluginEnabled("view-counts", categoryId),
    isPluginEnabled("social-share", categoryId),
    isPluginEnabled("subscriptions", categoryId),
    isPluginEnabled("playlists", categoryId),
    isPluginEnabled("likes-dislikes", categoryId),
    isPluginEnabled("up-next", categoryId),
    user
      ? hasCapability(user, "moderate_comments", { categoryId, seriesId: video.seriesId })
      : Promise.resolve(false),
    isVideoLockedBySequence(user?.id ?? null, video),
  ]);
  const resumeAt = progress && !progress.completed ? progress.positionSeconds : 0;

  if (!isPendingPremiere && viewCountsOn) {
    await incrementVideoViewCount(video.id);
    await logVideoView(video.id, user?.id ?? null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
      {video.series && (
        <Link
          href={`/series/${video.series.slug}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← {video.series.title}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {user && favoritesOn && <FavoriteButton type="video" id={video.id} initialFavorited={favorited} />}
          {user && watchLaterOn && <WatchLaterButton type="video" id={video.id} initialQueued={queued} />}
          {user && playlistsOn && <AddToPlaylistButton videoId={video.id} />}
          {user && video.seriesId && subscriptionsOn && (
            <SubscribeButton type="series" id={video.seriesId} initialSubscribed={subscribed} />
          )}
        </div>
      </div>

      {(ratingsOn || viewCountsOn || likesOn) && (
        <div className="flex flex-wrap items-center gap-4">
          {ratingsOn && <StarRating type="video" id={video.id} canRate={Boolean(user)} />}
          {likesOn && <ReactionButtons type="video" id={video.id} canReact={Boolean(user)} />}
          {viewCountsOn && (
            <span className="text-sm text-zinc-500">
              {video.viewCount + 1} view{video.viewCount === 0 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {socialShareOn && <ShareButtons title={video.title} path={`/videos/${video.slug}`} />}

      {isPendingPremiere && video.publishAt ? (
        <PremiereCountdown premiereAt={video.publishAt.toISOString()} />
      ) : sequenceLocked ? (
        <div className="aspect-video flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
          <p>🔒 Watch the previous episode in this series first.</p>
          {video.series && (
            <Link href={`/series/${video.series.slug}`} className="text-sm underline">
              Back to {video.series.title}
            </Link>
          )}
        </div>
      ) : video.status === "READY" ? (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            src={bunnyStreamEmbedUrl(video.bunnyVideoId, resumeAt)}
            className="h-full w-full"
            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="aspect-video flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
          This video is still processing. Please check back soon.
        </div>
      )}
      {!isPendingPremiere && video.status === "READY" && !sequenceLocked && (
        <p className="text-xs text-zinc-400">
          Tip: use the player&apos;s ⚙️ settings icon to change playback speed.
        </p>
      )}

      {video.description && <p className="text-zinc-600 dark:text-zinc-400">{video.description}</p>}

      {user && video.status === "READY" && !sequenceLocked && (
        <WatchProgressTracker
          videoId={video.id}
          startPositionSeconds={resumeAt}
          durationSeconds={video.durationSeconds}
        />
      )}

      {upNextOn && upNext && !isPendingPremiere && (
        <UpNextPanel
          href={`/videos/${upNext.slug}`}
          title={upNext.title}
          thumbnailUrl={bunnyStreamThumbnailUrl(upNext.bunnyVideoId)}
          durationSeconds={video.durationSeconds}
          resumeAtSeconds={resumeAt}
        />
      )}

      {relatedOn && related.length > 0 && (
        <section className="pt-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
            {video.series ? "More from this series" : "You might also like"}
          </h2>
          <div className="space-y-3">
            {related.map((v) => (
              <MenuTile
                key={v.id}
                href={`/videos/${v.slug}`}
                title={v.title}
                subtitle={v.series?.title}
                thumbnailUrl={bunnyStreamThumbnailUrl(v.bunnyVideoId)}
              />
            ))}
          </div>
        </section>
      )}

      {commentsOn && (
        <CommentSection
          type="video"
          id={video.id}
          currentUserId={user?.id ?? null}
          canModerate={canModerate}
        />
      )}
    </div>
  );
}
