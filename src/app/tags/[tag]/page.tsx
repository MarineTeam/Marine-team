import Link from "next/link";
import { SeriesTile } from "@/components/series-tile";
import { getSeriesByTag } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const [{ tag }, user] = await Promise.all([params, getCurrentUser()]);
  const series = await getSeriesByTag(decodeURIComponent(tag), Boolean(user));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Browse
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">#{decodeURIComponent(tag)}</h1>
      </div>

      {series.length === 0 ? (
        <p className="text-zinc-500">Nothing tagged &ldquo;{decodeURIComponent(tag)}&rdquo; yet.</p>
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
