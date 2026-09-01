import { getCurrentUser } from "@/lib/current-user";
import { getWatchLater } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { CategoryTile } from "@/components/category-tile";
import { videoThumbnailUrl } from "@/lib/video-source";

export default async function WatchLaterPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your Watch Later queue.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Log in
        </a>
      </div>
    );
  }

  const { seriesQueue, videoQueue, categoryQueue } = await getWatchLater(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Watch Later</h1>

      {seriesQueue.length === 0 && videoQueue.length === 0 && categoryQueue.length === 0 && (
        <p className="text-sec">
          Nothing queued yet — look for the Watch Later button on a category, series, or video.
        </p>
      )}

      {categoryQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Categories</h2>
          <div className="space-y-3">
            {categoryQueue.map((entry) => (
              <CategoryTile key={entry.id} category={entry.category} />
            ))}
          </div>
        </section>
      )}

      {seriesQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Series</h2>
          <div className="space-y-3">
            {seriesQueue.map((entry) => (
              <SeriesTile key={entry.id} series={entry.series} />
            ))}
          </div>
        </section>
      )}

      {videoQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Videos</h2>
          <div className="space-y-3">
            {videoQueue.map((entry) => (
              <MenuTile
                key={entry.id}
                href={`/videos/${entry.video.slug}`}
                title={entry.video.title}
                subtitle={entry.video.series?.title}
                thumbnailUrl={videoThumbnailUrl(entry.video)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
