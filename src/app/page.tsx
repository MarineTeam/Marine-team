import Link from "next/link";
import { HeroBanner } from "@/components/hero-banner";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { getPluginStates } from "@/lib/plugins";
import {
  getFeaturedSeries,
  getPublishedCategoriesWithSeries,
  getUncategorizedSeries,
  getRecentlyAdded,
  getContinueWatching,
  getTrendingSeries,
  getRecommendedSeries,
  getCurrentLiveStream,
  getHomeRows,
  getCategoryRowSeries,
  getSeriesByTag,
} from "@/lib/content";

export default async function Home() {
  const user = await getCurrentUser();
  const isLoggedIn = Boolean(user);
  const [featured, categories, uncategorized, plugins, homeRows] = await Promise.all([
    getFeaturedSeries(),
    getPublishedCategoriesWithSeries(isLoggedIn),
    getUncategorizedSeries(),
    getPluginStates(),
    getHomeRows(),
  ]);
  const viewCountsOn = plugins["view-counts"];
  const recommendationsOn = plugins.recommendations;
  const liveStreamingOn = plugins["live-streaming"];
  const liveStream = liveStreamingOn ? await getCurrentLiveStream() : null;

  // Continue Watching always renders above the browse list (its position
  // among the HomeRow order only matters relative to the other rows below);
  // everything else is admin-reorderable below the listing.
  const continueWatchingEnabled = homeRows.some((r) => r.type === "CONTINUE_WATCHING" && r.enabled);
  const otherRows = homeRows.filter((r) => r.enabled && r.type !== "CONTINUE_WATCHING");
  const wantsRecommendations = otherRows.some((r) => r.type === "RECOMMENDATIONS");
  const wantsTrending = otherRows.some((r) => r.type === "TRENDING");
  const wantsRecentlyAdded = otherRows.some((r) => r.type === "RECENTLY_ADDED");

  const [continueWatching, recommended, trending, recentlyAdded] = await Promise.all([
    continueWatchingEnabled && user ? getContinueWatching(user.id) : Promise.resolve([]),
    wantsRecommendations && user && recommendationsOn ? getRecommendedSeries(user.id) : Promise.resolve(null),
    wantsTrending && viewCountsOn ? getTrendingSeries() : Promise.resolve([]),
    wantsRecentlyAdded ? getRecentlyAdded(isLoggedIn) : Promise.resolve([]),
  ]);

  const categoryRows = otherRows.filter(
    (r): r is typeof r & { categoryId: string } => r.type === "CATEGORY" && Boolean(r.categoryId),
  );
  const tagRows = otherRows.filter((r): r is typeof r & { tag: string } => r.type === "TAG" && Boolean(r.tag));
  const [categoryRowSeriesList, tagRowSeriesList] = await Promise.all([
    Promise.all(categoryRows.map((r) => getCategoryRowSeries(r.categoryId))),
    Promise.all(tagRows.map((r) => getSeriesByTag(r.tag))),
  ]);
  const categoryRowSeriesByRowId = new Map(categoryRows.map((r, i) => [r.id, categoryRowSeriesList[i]]));
  const tagRowSeriesByRowId = new Map(tagRows.map((r, i) => [r.id, tagRowSeriesList[i]]));

  // Every published category lists, empty or not — matching how an empty
  // series still appears, so a category isn't invisible until it has content.
  const hasContent = categories.length > 0 || uncategorized.length > 0;

  return (
    <div className="pb-12">
      {liveStream && (
        <Link
          href="/live"
          className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          Live now: {liveStream.title}
        </Link>
      )}

      {featured && (
        <div className="hidden sm:block">
          <HeroBanner series={featured} />
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-8">
        {!featured && (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Marine Team</h1>
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

        {otherRows.map((row) => {
          switch (row.type) {
            case "RECOMMENDATIONS":
              return recommended ? (
                <section key={row.id} className="space-y-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    {row.title || `Because you watched ${recommended.anchorTitle}`}
                  </h2>
                  <div className="space-y-3">
                    {recommended.series.map((series) => (
                      <SeriesTile key={series.id} series={series} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "TRENDING":
              return trending.length > 0 ? (
                <section key={row.id} className="space-y-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    {row.title || "🔥 Trending this week"}
                  </h2>
                  <div className="space-y-3">
                    {trending.map((series) => (
                      <SeriesTile key={series.id} series={series} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "RECENTLY_ADDED":
              return recentlyAdded.length > 0 ? (
                <section key={row.id} className="hidden sm:block space-y-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    {row.title || "Recently added"}
                  </h2>
                  <div className="space-y-3">
                    {recentlyAdded.map((item) =>
                      item.kind === "category" ? (
                        <CategoryTile key={`category:${item.category.id}`} category={item.category} />
                      ) : (
                        <SeriesTile key={`series:${item.series.id}`} series={item.series} />
                      ),
                    )}
                  </div>
                </section>
              ) : null;

            case "CATEGORY": {
              const series = categoryRowSeriesByRowId.get(row.id) ?? [];
              return series.length > 0 ? (
                <section key={row.id} className="space-y-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    {row.title || row.category?.name || "Category"}
                  </h2>
                  <div className="space-y-3">
                    {series.map((s) => (
                      <SeriesTile key={s.id} series={s} />
                    ))}
                  </div>
                </section>
              ) : null;
            }

            case "TAG": {
              const series = tagRowSeriesByRowId.get(row.id) ?? [];
              return series.length > 0 ? (
                <section key={row.id} className="space-y-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    {row.title || `#${row.tag}`}
                  </h2>
                  <div className="space-y-3">
                    {series.map((s) => (
                      <SeriesTile key={s.id} series={s} />
                    ))}
                  </div>
                </section>
              ) : null;
            }

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
