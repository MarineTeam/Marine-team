import { SeriesCard } from "@/components/series-card";
import { getPublishedCategoriesWithSeries, getUncategorizedSeries } from "@/lib/content";

export default async function Home() {
  const [categories, uncategorized] = await Promise.all([
    getPublishedCategoriesWithSeries(),
    getUncategorizedSeries(),
  ]);

  const hasContent =
    categories.some((category) => category.series.length > 0) || uncategorized.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Media Library</h1>
        <p className="mt-2 text-zinc-500">Browse series, watch videos, and download files.</p>
      </div>

      {!hasContent && (
        <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
      )}

      {categories
        .filter((category) => category.series.length > 0)
        .map((category) => (
          <section key={category.id}>
            <h2 className="text-xl font-semibold mb-4">{category.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.series.map((series) => (
                <SeriesCard key={series.id} series={series} />
              ))}
            </div>
          </section>
        ))}

      {uncategorized.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">More</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {uncategorized.map((series) => (
              <SeriesCard key={series.id} series={series} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
