import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { truncateDescription, siteUrl } from "@/lib/seo";
import { jsonLdScriptProps, breadcrumbListJsonLd, type BreadcrumbItem } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getVideoBySlugIncludingPremiere,
  resolveVideoSlugAlias,
  getWatchProgressForVideo,
  getRelatedVideos,
  getUpNextVideo,
  isVideoFavorited,
  isVideoInWatchLater,
  isSeriesSubscribed,
  incrementVideoViewCount,
  isVideoLockedBySequence,
  canViewVideo,
  getVideoRatingSummary,
  getUserVideoRating,
  getVideoReactionSummary,
  getUserVideoReaction,
  getComments,
  getVideoChapters,
  getSermonNotes,
  getOutlineAnswers,
} from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { getShareOptions } from "@/lib/share-links";
import { getDownloadAvailability } from "@/lib/downloads";
import { getPluginStates } from "@/lib/plugins";
import { bunnyStreamEmbedUrl, bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { WatchProgressTracker } from "@/components/watch-progress-tracker";
import { VideoPlayer } from "@/components/video-player";
import { FavoriteButton } from "@/components/favorite-button";
import { MarkWatchedButton } from "@/components/mark-watched-button";
import { WatchLaterButton } from "@/components/watch-later-button";
import { SubscribeButton } from "@/components/subscribe-button";
import { AddToPlaylistButton } from "@/components/add-to-playlist-button";
import { StarRating } from "@/components/star-rating";
import { ReactionButtons } from "@/components/reaction-buttons";
import { ShareButtons } from "@/components/share-buttons";
import { TimestampShareLink } from "@/components/timestamp-share-link";
import { ShareLinkPanel } from "@/components/share-link-panel";
import { DownloadButton } from "@/components/download-button";
import { CastButton } from "@/components/cast-button";
import { MenuTile } from "@/components/menu-tile";
import { CommentSection } from "@/components/comment-section";
import { SermonNotesPanel } from "@/components/sermon-notes-panel";
import { SermonOutline } from "@/components/sermon-outline";
import { UpNextPanel } from "@/components/up-next-panel";
import { PremiereCountdown } from "@/components/premiere-countdown";
import { ViewEventBeacon } from "@/components/view-event-beacon";

/**
 * Mirrors the page body's own restraint: a video the current visitor can't
 * view gets a generic title and no thumbnail here too, rather than letting
 * link-preview metadata leak more than the page itself shows.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [video, user] = await Promise.all([getVideoBySlugIncludingPremiere(slug), getCurrentUser()]);
  if (!video) return {};

  if (!(await canViewVideo(user, video))) {
    return { title: "Members Only", description: "This video is for members only." };
  }

  const description = video.description
    ? truncateDescription(video.description)
    : `Watch ${video.title}${video.series ? ` from ${video.series.title}` : ""} on Marine Team.`;
  const thumbnailUrl = bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName) || undefined;

  return {
    title: video.title,
    description,
    openGraph: {
      title: video.title,
      description,
      type: "video.other",
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
    twitter: {
      card: thumbnailUrl ? "summary_large_image" : "summary",
      title: video.title,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
  };
}

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  // A shared timestamp link (?t=123, seconds) always wins over the viewer's
  // own resume position — clicking a link someone sent you should jump to
  // the moment they meant, not silently continue from where you left off.
  const sharedStart = Number(t);
  const sharedTimestamp = t && Number.isFinite(sharedStart) && sharedStart >= 0 ? Math.floor(sharedStart) : null;
  const [video, user] = await Promise.all([getVideoBySlugIncludingPremiere(slug), getCurrentUser()]);

  if (!video) {
    const currentSlug = await resolveVideoSlugAlias(slug);
    if (currentSlug) permanentRedirect(`/videos/${currentSlug}`);
    notFound();
  }

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
            className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
          >
            Log in to watch
          </a>
        )}
      </div>
    );
  }

  // Built only after the access check above passes, so a video this viewer
  // can't see never gets structured data emitted for it either.
  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description || `Watch ${video.title} on Marine Team.`,
    thumbnailUrl: [bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName)],
    uploadDate: video.createdAt.toISOString(),
    ...(video.durationSeconds ? { duration: `PT${video.durationSeconds}S` } : {}),
    ...(video.status === "READY" ? { embedUrl: bunnyStreamEmbedUrl(video.bunnyVideoId) } : {}),
  };
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    ...(video.series ? [{ label: video.series.title, href: `/series/${video.series.slug}` }] : []),
    { label: video.title },
  ];
  const breadcrumbJsonLd = breadcrumbListJsonLd(breadcrumbItems, siteUrl);

  const isLoggedIn = Boolean(user);
  const categoryId = video.series?.categoryId ?? null;
  const [
    progress,
    favorited,
    queued,
    subscribed,
    plugins,
    canModerate,
    sequenceLocked,
  ] = await Promise.all([
    user ? getWatchProgressForVideo(user.id, video.id) : Promise.resolve(null),
    user ? isVideoFavorited(user.id, video.id) : Promise.resolve(false),
    user ? isVideoInWatchLater(user.id, video.id) : Promise.resolve(false),
    user && video.seriesId ? isSeriesSubscribed(user.id, video.seriesId) : Promise.resolve(false),
    getPluginStates(categoryId),
    user
      ? hasCapability(user, "moderate_comments", { categoryId, seriesId: video.seriesId })
      : Promise.resolve(false),
    isVideoLockedBySequence(user?.id ?? null, video),
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
    playlists: playlistsOn,
    "likes-dislikes": likesOn,
    "up-next": upNextOn,
    chapters: chaptersOn,
    transcripts: transcriptsOn,
    "sermon-notes": sermonNotesOn,
    "share-links": shareLinksOn,
    downloads: downloadsOn,
  } = plugins;
  const resumeAt = sharedTimestamp ?? (progress && !progress.completed ? progress.positionSeconds : 0);

  const [
    ratingSummary,
    myRating,
    reactionSummary,
    myReaction,
    related,
    comments,
    upNext,
    chapters,
    sermonNotes,
    outlineSheet,
    shareOptions,
    downloadAvailability,
  ] = await Promise.all([
      ratingsOn ? getVideoRatingSummary(video.id) : Promise.resolve({ average: 0, count: 0 }),
      ratingsOn && user ? getUserVideoRating(user.id, video.id) : Promise.resolve(null),
      likesOn ? getVideoReactionSummary(video.id) : Promise.resolve({ likes: 0, dislikes: 0 }),
      likesOn && user ? getUserVideoReaction(user.id, video.id) : Promise.resolve(null),
      relatedOn ? getRelatedVideos(video, isLoggedIn) : Promise.resolve([]),
      commentsOn ? getComments("video", video.id) : Promise.resolve([]),
      upNextOn ? getUpNextVideo(video, isLoggedIn) : Promise.resolve(null),
      chaptersOn ? getVideoChapters(video.id) : Promise.resolve([]),
      sermonNotesOn && user ? getSermonNotes(user.id, video.id) : Promise.resolve([]),
      // The sheet itself is public where the video is: a visitor can read and
      // print it, and is told that keeping their answers needs an account.
      sermonNotesOn && video.noteOutline && user
        ? getOutlineAnswers(user.id, video.id, video.noteOutline)
        : Promise.resolve({ answers: {} as Record<string, string>, outlineChanged: false }),
      shareLinksOn
        ? getShareOptions(user, {
            type: "video",
            id: video.id,
            memberOnly: video.memberOnly,
            categoryId: video.categoryId,
            seriesId: video.seriesId,
          })
        : Promise.resolve({ canShare: false, targetIsRestricted: false, canGrantAccess: false }),
      // Platform deliberately unresolved here: only the browser knows whether
      // it's the installed app, so the button gets the policy and finishes the
      // decision itself.
      downloadsOn && user
        ? getDownloadAvailability({ user, video, platform: "any" })
        : Promise.resolve({ allowed: false as const, reason: "plugin_off" as const, message: "" }),
    ]);
  const initialComments = comments.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    replies: c.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }));

  if (!isPendingPremiere && viewCountsOn) await incrementVideoViewCount(video.id);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
      <script {...jsonLdScriptProps(videoJsonLd)} />
      <script {...jsonLdScriptProps(breadcrumbJsonLd)} />
      <Breadcrumbs items={breadcrumbItems} />
      {!isPendingPremiere && viewCountsOn && <ViewEventBeacon type="video" id={video.id} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {user && favoritesOn && <FavoriteButton type="video" id={video.id} initialFavorited={favorited} />}
          {user && watchLaterOn && <WatchLaterButton type="video" id={video.id} initialQueued={queued} />}
          {user && video.status === "READY" && !sequenceLocked && (
            <MarkWatchedButton videoId={video.id} initialCompleted={progress?.completed ?? false} />
          )}
          {user && playlistsOn && <AddToPlaylistButton videoId={video.id} />}
          {user && video.seriesId && subscriptionsOn && (
            <SubscribeButton type="series" id={video.seriesId} initialSubscribed={subscribed} />
          )}
        </div>
      </div>

      {(ratingsOn || viewCountsOn || likesOn) && (
        <div className="flex flex-wrap items-center gap-4">
          {ratingsOn && (
            <StarRating
              type="video"
              id={video.id}
              canRate={Boolean(user)}
              initial={{ ...ratingSummary, mine: myRating }}
            />
          )}
          {likesOn && (
            <ReactionButtons
              type="video"
              id={video.id}
              canReact={Boolean(user)}
              initial={{ ...reactionSummary, mine: myReaction }}
            />
          )}
          {viewCountsOn && (
            <span className="text-sm text-sec">
              {video.viewCount + 1} view{video.viewCount === 0 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {socialShareOn && <ShareButtons title={video.title} path={`/videos/${video.slug}`} />}
      {socialShareOn && !isPendingPremiere && video.status === "READY" && !sequenceLocked && (
        <TimestampShareLink path={`/videos/${video.slug}`} />
      )}
      {/* Not while sequence-locked: the member can't watch this episode yet,
          so handing out a link to it would be odd — matches the series page,
          which hides the panel behind the same gate. */}
      {shareOptions.canShare && !sequenceLocked && (
        <ShareLinkPanel videoId={video.id} canGrantAccess={shareOptions.canGrantAccess} />
      )}
      {downloadAvailability.allowed && !sequenceLocked && !isPendingPremiere && video.status === "READY" && (
        <DownloadButton
          videoId={video.id}
          title={video.title}
          seriesTitle={video.series?.title ?? null}
          videoSlug={video.slug}
          durationSeconds={video.durationSeconds}
          policyPlatform={downloadAvailability.platform}
        />
      )}
      {/* Same gate as the download button above: casting reuses that same
          signed-MP4 endpoint and policy, so there's no point showing this
          where that endpoint would just refuse. */}
      {downloadAvailability.allowed && !sequenceLocked && !isPendingPremiere && video.status === "READY" && (
        <CastButton
          videoId={video.id}
          title={video.title}
          artworkUrl={bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName) || undefined}
        />
      )}

      {isPendingPremiere && video.publishAt ? (
        <PremiereCountdown premiereAt={video.publishAt.toISOString()} />
      ) : sequenceLocked ? (
        <div className="aspect-video flex flex-col items-center justify-center gap-2 rounded-lg bg-chip text-sec">
          <p>🔒 Watch the previous episode in this series first.</p>
          {video.series && (
            <Link href={`/series/${video.series.slug}`} className="text-sm underline">
              Back to {video.series.title}
            </Link>
          )}
        </div>
      ) : video.status === "READY" ? (
        <VideoPlayer
          embedUrl={bunnyStreamEmbedUrl(video.bunnyVideoId, resumeAt)}
          chapters={chaptersOn ? chapters : []}
        />
      ) : (
        <div className="aspect-video flex items-center justify-center rounded-lg bg-chip text-sec">
          This video is still processing. Please check back soon.
        </div>
      )}
      {!isPendingPremiere && video.status === "READY" && !sequenceLocked && (
        <p className="text-xs text-ter">
          Tip: use the player&apos;s ⚙️ settings icon to change playback speed.
        </p>
      )}

      {video.description && <p className="text-sec">{video.description}</p>}

      {transcriptsOn && video.transcript && (
        <details className="rounded-lg border border-sep p-3 text-sm">
          <summary className="cursor-pointer font-medium">Transcript</summary>
          <p className="mt-2 whitespace-pre-wrap text-sec">{video.transcript}</p>
        </details>
      )}

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
          thumbnailUrl={bunnyStreamThumbnailUrl(upNext.bunnyVideoId, upNext.thumbnailFileName)}
          durationSeconds={video.durationSeconds}
          resumeAtSeconds={resumeAt}
        />
      )}

      {relatedOn && related.length > 0 && (
        <section className="pt-4">
          <h2 className="mb-3 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
            {video.series ? "More from this series" : "You might also like"}
          </h2>
          <div className="space-y-3">
            {related.map((v) => (
              <MenuTile
                key={v.id}
                href={`/videos/${v.slug}`}
                title={v.title}
                subtitle={v.series?.title}
                thumbnailUrl={bunnyStreamThumbnailUrl(v.bunnyVideoId, v.thumbnailFileName)}
              />
            ))}
          </div>
        </section>
      )}

      {/* The sheet with gaps in it, above the member's own free notes: it is
          the thing being filled in *during* the talk. */}
      {sermonNotesOn && video.noteOutline && (
        <SermonOutline
          videoId={video.id}
          videoTitle={video.title}
          outline={video.noteOutline}
          initialAnswers={outlineSheet.answers}
          outlineChanged={outlineSheet.outlineChanged}
          canSave={Boolean(user)}
        />
      )}

      {sermonNotesOn && user && (
        <SermonNotesPanel
          videoId={video.id}
          videoTitle={video.title}
          initialNotes={sermonNotes}
          startPositionSeconds={resumeAt}
        />
      )}

      {commentsOn && (
        <CommentSection
          type="video"
          id={video.id}
          currentUserId={user?.id ?? null}
          canModerate={canModerate}
          initialComments={initialComments}
        />
      )}
    </div>
  );
}
