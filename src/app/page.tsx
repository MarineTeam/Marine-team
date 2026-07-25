import Link from "next/link";
import { HeroBanner } from "@/components/hero-banner";
import { SeriesRow } from "@/components/series-row";
import { CategoryRow } from "@/components/category-row";
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

  const hasContent =
    categories.some((category) => category.series.length > 0 || category.children.length > 0) ||
    uncategorized.length > 0;

  return (
    <div className="space-y-10 pb-12">
      {featured && <HeroBanner series={featured} />}

      <div className="max-w-6xl mx-auto px-4 space-y-10">
        {!featured && (
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Media Library</h1>
            <p className="mt-2 text-zinc-500">Browse series, watch videos, and download files.</p>
          </div>
        )}

        {!hasContent && (
          <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
        )}

        {categories
          .filter((category) => category.series.length > 0 || category.children.length > 0)
          .map((category) => (
            <section key={category.id} className="space-y-4">
              <Link
                href={`/categories/${category.slug}`}
                className="block px-4 sm:px-0 text-lg font-semibold hover:underline"
              >
                {category.name} <span aria-hidden>→</span>
              </Link>
              {category.children.length > 0 && <CategoryRow categories={category.children} />}
              {category.series.length > 0 && <SeriesRow series={category.series} />}
            </section>
          ))}

        {uncategorized.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 px-4 sm:px-0">More</h2>
            <SeriesRow series={uncategorized} />
          </section>
        )}
      </div>
    </div>
  );
}
