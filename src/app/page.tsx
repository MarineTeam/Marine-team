import { HeroBanner } from "@/components/hero-banner";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { isPluginEnabled } from "@/lib/plugins";
import {
  getFeaturedSeries,
  getPublishedCategoriesWithSeries,
  getUncategorizedSeries,
  getRecentlyAddedSeries,
  getContinueWatching,
  getTrendingSeries,
} from "@/lib/content";

export default async function Home() {
  const user = await getCurrentUser();
  const isLoggedIn = Boolean(user);
  const [featured, categories, uncategorized, recentlyAdded, continueWatching, viewCountsOn] = await Promise.all([
    getFeaturedSeries(isLoggedIn),
    getPublishedCategoriesWithSeries(isLoggedIn),
    getUncategorizedSeries(isLoggedIn),
    getRecentlyAddedSeries(isLoggedIn),
    user ? getContinueWatching(user.id) : Promise.resolve([]),
    isPluginEnabled("view-counts"),
  ]);
  const trending = viewCountsOn ? await getTrendingSeries(isLoggedIn) : [];

  // Every published category lists, empty or not — matching how an empty
  // series still appears, so a category isn't invisible until it has content.
  const hasContent = categories.length > 0 || uncategorized.length > 0;

  return (
    <div className="pb-12">
      {featured && (
        <div className="hidden sm:block">
          <HeroBanner series={featured} />
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-8">
        {!featured && (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Media Library</h1>
            <p className="mt-2 text-zinc-500">Browse series, watch videos, and download files.</p>
          </div>
        )}

        {continueWatching.length > 0 && (
          <section className="hidden sm:block space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Continue watching
            </h2>
            <div className="space-y-3">
              {continueWatching.map((entry) => (
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

        {!hasContent && (
          <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
        )}

        {hasContent && (
          <div className="space-y-3">
            {categories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
            {uncategorized.map((series) => (
              <SeriesTile key={series.id} series={series} />
            ))}
          </div>
        )}

        {trending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              🔥 Trending this week
            </h2>
            <div className="space-y-3">
              {trending.map((series) => (
                <SeriesTile key={series.id} series={series} />
              ))}
            </div>
          </section>
        )}

        {recentlyAdded.length > 0 && (
          <section className="hidden sm:block space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Recently added
            </h2>
            <div className="space-y-3">
              {recentlyAdded.map((series) => (
                <SeriesTile key={series.id} series={series} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
