import { getRecentlyAdded } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { SeriesTile } from "@/components/series-tile";
import { CategoryTile } from "@/components/category-tile";

export default async function RecentlyAddedPage() {
  const user = await getCurrentUser();
  const recentlyAdded = await getRecentlyAdded(Boolean(user), 30);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Recently Added</h1>

      {recentlyAdded.length === 0 ? (
        <p className="text-zinc-500">Nothing has been published yet. Check back soon.</p>
      ) : (
        <div className="space-y-3">
          {recentlyAdded.map((item) =>
            item.kind === "category" ? (
              <CategoryTile key={`category:${item.category.id}`} category={item.category} />
            ) : (
              <SeriesTile key={`series:${item.series.id}`} series={item.series} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
