import { HeroBanner } from "@/components/hero-banner";
import { SeriesRow } from "@/components/series-row";
import {
  getFeaturedSeries,
  getPublishedCategoriesWithSeries,
  getUncategorizedSeries,
} from "@/lib/content";
import { demoPrisma } from "@/lib/demo-db";

export default async function DemoHome() {
  const [featured, categories, uncategorized] = await Promise.all([
    getFeaturedSeries(demoPrisma),
    getPublishedCategoriesWithSeries(demoPrisma),
    getUncategorizedSeries(demoPrisma),
  ]);

  const hasContent =
    categories.some((category) => category.series.length > 0) || uncategorized.length > 0;

  return (
    <div className="space-y-10 pb-12">
      {featured && <HeroBanner series={featured} basePath="/demo" />}

      <div className="max-w-6xl mx-auto px-4 space-y-10">
        {!featured && (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Media Library (Demo)</h1>
            <p className="mt-2 text-zinc-500">Browse series, watch videos, and download files.</p>
          </div>
        )}

        {!hasContent && (
          <p className="text-zinc-500">
            Nothing seeded yet. Run the demo setup from /admin/demo or `npm run db:seed`.
          </p>
        )}

        {categories
          .filter((category) => category.series.length > 0)
          .map((category) => (
            <SeriesRow
              key={category.id}
              title={category.name}
              series={category.series}
              basePath="/demo"
            />
          ))}

        <SeriesRow title="More" series={uncategorized} basePath="/demo" />
      </div>
    </div>
  );
}
