import { getRecentlyAddedSeries } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";

export default async function RecentlyAddedPage() {
  const recentlyAdded = await getRecentlyAddedSeries(30);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Recently Added</h1>

      {recentlyAdded.length === 0 ? (
        <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
      ) : (
        <div className="space-y-3">
          {recentlyAdded.map((series) => (
            <SeriesTile key={series.id} series={series} />
          ))}
        </div>
      )}
    </div>
  );
}
