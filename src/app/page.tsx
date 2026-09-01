import Link from "next/link";
import { HeroBanner } from "@/components/hero-banner";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { getBranding } from "@/lib/branding";
import { getCurrentUser } from "@/lib/current-user";
import { getPluginStates } from "@/lib/plugins";
import { videoThumbnailUrl } from "@/lib/video-source";
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

/** The small uppercase heading each admin-orderable row sits under. */
function RowHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">{children}</h2>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const isLoggedIn = Boolean(user);
  const [featured, categories, uncategorized, plugins, homeRows, branding] = await Promise.all([
    getFeaturedSeries(),
    getPublishedCategoriesWithSeries(isLoggedIn),
    getUncategorizedSeries(),
    getPluginStates(),
    getHomeRows(),
    getBranding(),
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
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live now: {liveStream.title}
        </Link>
      )}

      {featured && (
        <div className="hidden sm:block">
          <HeroBanner series={featured} />
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 sm:py-10">
        {/*
          The page's own title. Present whether or not there's a hero, because
          in the installed app the bar above shows only the wordmark — the
          screen needs to say what it is, the way a native app's large title
          does.
        */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Home</h1>
          {!featured && (
            <p className="mt-2 text-sec">
              Browse {branding.name} — series, videos, and downloads.
            </p>
          )}
        </div>

        {continueWatching.length > 0 && (
          <section className="hidden space-y-2 sm:block">
            <RowHeading>Continue watching</RowHeading>
            <div className="space-y-3">
              {continueWatching.map((entry) => (
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

        {!hasContent && <p className="text-sec">Nothing has been published yet. Check back soon.</p>}

        {/*
          The browse list is one panel of hairline-divided rows rather than a
          stack of cards: it is the spine of the app, and a card each turns
          six sections into six competing objects.
        */}
        {hasContent && (
          <div className="divide-y divide-sep overflow-hidden rounded-xl border border-sep bg-panel">
            {categories.map((category) => (
              <CategoryTile key={category.id} category={category} variant="row" />
            ))}
            {uncategorized.map((series) => (
              <SeriesTile key={series.id} series={series} variant="row" />
            ))}
          </div>
        )}

        {otherRows.map((row) => {
          switch (row.type) {
            case "RECOMMENDATIONS":
              return recommended ? (
                <section key={row.id} className="space-y-2">
                  <RowHeading>
                    {row.title || `Because you watched ${recommended.anchorTitle}`}
                  </RowHeading>
                  <div className="space-y-3">
                    {recommended.series.map((series) => (
                      <SeriesTile key={series.id} series={series} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "TRENDING":
              return trending.length > 0 ? (
                <section key={row.id} className="space-y-2">
                  <RowHeading>{row.title || "🔥 Trending this week"}</RowHeading>
                  <div className="space-y-3">
                    {trending.map((series) => (
                      <SeriesTile key={series.id} series={series} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "RECENTLY_ADDED":
              return recentlyAdded.length > 0 ? (
                <section key={row.id} className="hidden space-y-2 sm:block">
                  <RowHeading>{row.title || "Recently added"}</RowHeading>
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
                <section key={row.id} className="space-y-2">
                  <RowHeading>{row.title || row.category?.name || "Category"}</RowHeading>
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
                <section key={row.id} className="space-y-2">
                  <RowHeading>{row.title || `#${row.tag}`}</RowHeading>
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
