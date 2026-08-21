import Link from "next/link";
import { SeriesTile } from "@/components/series-tile";
import { getSeriesByTag } from "@/lib/content";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const series = await getSeriesByTag(decodeURIComponent(tag));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/" className="text-sm text-sec hover:underline">
          ← Browse
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">#{decodeURIComponent(tag)}</h1>
      </div>

      {series.length === 0 ? (
        <p className="text-sec">Nothing tagged &ldquo;{decodeURIComponent(tag)}&rdquo; yet.</p>
      ) : (
        <div className="space-y-3">
          {series.map((s) => (
            <SeriesTile key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  );
}
