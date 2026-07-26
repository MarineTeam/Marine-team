import { getCurrentUser } from "@/lib/current-user";
import { getWatchLater } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { CategoryTile } from "@/components/category-tile";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function WatchLaterPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your Watch Later queue.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in
        </a>
      </div>
    );
  }

  const { seriesQueue, videoQueue, categoryQueue } = await getWatchLater(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Watch Later</h1>

      {seriesQueue.length === 0 && videoQueue.length === 0 && categoryQueue.length === 0 && (
        <p className="text-zinc-500">
          Nothing queued yet — look for the Watch Later button on a category, series, or video.
        </p>
      )}

      {categoryQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Categories</h2>
          <div className="space-y-3">
            {categoryQueue.map((entry) => (
              <CategoryTile key={entry.id} category={entry.category} />
            ))}
          </div>
        </section>
      )}

      {seriesQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Series</h2>
          <div className="space-y-3">
            {seriesQueue.map((entry) => (
              <SeriesTile key={entry.id} series={entry.series} />
            ))}
          </div>
        </section>
      )}

      {videoQueue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Videos</h2>
          <div className="space-y-3">
            {videoQueue.map((entry) => (
              <MenuTile
                key={entry.id}
                href={`/videos/${entry.video.slug}`}
                title={entry.video.title}
                subtitle={entry.video.series?.title}
                thumbnailUrl={bunnyStreamThumbnailUrl(entry.video.bunnyVideoId, entry.video.thumbnailFileName)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
