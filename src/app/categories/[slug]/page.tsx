import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesCard } from "@/components/series-card";
import { getCategoryBySlug } from "@/lib/content";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Browse
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{category.name}</h1>
      </div>

      {category.series.length === 0 ? (
        <p className="text-zinc-500">Nothing published in this category yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {category.series.map((series) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </div>
      )}
    </div>
  );
}
