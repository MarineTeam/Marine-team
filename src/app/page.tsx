import { HeroBanner } from "@/components/hero-banner";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import {
  getFeaturedSeries,
  getPublishedCategoriesWithSeries,
  getUncategorizedSeries,
} from "@/lib/content";

export default async function Home() {
  const [featured, categories, uncategorized] = await Promise.all([
    getFeaturedSeries(),
    getPublishedCategoriesWithSeries(),
    getUncategorizedSeries(),
  ]);

  const visibleCategories = categories.filter(
    (category) => category.series.length > 0 || category.children.length > 0,
  );
  const hasContent = visibleCategories.length > 0 || uncategorized.length > 0;

  return (
    <div className="pb-12">
      {featured && <HeroBanner series={featured} />}

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-6">
        {!featured && (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Media Library</h1>
            <p className="mt-2 text-zinc-500">Browse series, watch videos, and download files.</p>
          </div>
        )}

        {!hasContent && (
          <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
        )}

        {hasContent && (
          <div className="space-y-3">
            {visibleCategories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
            {uncategorized.map((series) => (
              <SeriesTile key={series.id} series={series} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
