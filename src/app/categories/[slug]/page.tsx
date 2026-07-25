import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
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
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
          ← {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{category.name}</h1>
      </div>

      {isEmpty && <p className="text-zinc-500">Nothing published in this category yet.</p>}

      {(category.children.length > 0 || category.series.length > 0) && (
        <div className="space-y-3">
          {category.children.map((child) => (
            <CategoryTile key={child.id} category={child} />
          ))}
          {category.series.map((series) => (
            <SeriesTile key={series.id} series={series} />
          ))}
        </div>
      )}
    </div>
  );
}
