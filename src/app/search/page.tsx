import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { searchContent } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const query = (q ?? "").trim();
  const results = query
    ? await searchContent(query, Boolean(user))
    : { categories: [], series: [], videos: [] };
  const hasResults =
    results.categories.length + results.series.length + results.videos.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <form action="/search" method="get" className="mt-3">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search series, videos, categories…"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </form>
      </div>

      {!query && <p className="text-zinc-500">Enter a search term above.</p>}
      {query && !hasResults && <p className="text-zinc-500">No results for &ldquo;{query}&rdquo;.</p>}

      {results.categories.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Categories</h2>
          <div className="space-y-3">
            {results.categories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {results.series.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Series</h2>
          <div className="space-y-3">
            {results.series.map((series) => (
              <SeriesTile key={series.id} series={series} />
            ))}
          </div>
        </section>
      )}

      {results.videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Videos</h2>
          <div className="space-y-3">
            {results.videos.map((video) => (
              <MenuTile
                key={video.id}
                href={`/videos/${video.slug}`}
                title={video.title}
                subtitle={video.series?.title ?? video.description}
                thumbnailUrl={bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName)}
                badge={video.memberOnly ? "Members" : undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
