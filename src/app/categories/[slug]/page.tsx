import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesCard } from "@/components/series-card";
import { CategoryCard } from "@/components/category-card";
import { getCategoryBySlug } from "@/lib/content";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  const backHref = category.parent ? `/categories/${category.parent.slug}` : "/";
  const backLabel = category.parent ? category.parent.name : "Browse";
  const isEmpty = category.series.length === 0 && category.children.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
          ← {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{category.name}</h1>
      </div>

      {isEmpty && <p className="text-zinc-500">Nothing published in this category yet.</p>}

      {category.children.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Categories</h2>
          <div className="flex flex-wrap gap-4">
            {category.children.map((child) => (
              <CategoryCard key={child.id} category={child} />
            ))}
          </div>
        </section>
      )}

      {category.series.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Series</h2>
          <div className="flex flex-wrap gap-4">
            {category.series.map((series) => (
              <SeriesCard key={series.id} series={series} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
