import Link from "next/link";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { searchContent, getSearchFilterOptions } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; speaker?: string; sort?: string }>;
}) {
  const [{ q, category, speaker, sort }, user, filterOptions] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getSearchFilterOptions(),
  ]);
  const query = (q ?? "").trim();
  const sortValue = sort === "newest" ? "newest" : "relevance";
  const results = query
    ? await searchContent(query, Boolean(user), {
        categoryId: category || undefined,
        speakerId: speaker || undefined,
        sort: sortValue,
      })
    : { categories: [], series: [], videos: [], files: [] };
  const hasResults =
    results.categories.length + results.series.length + results.videos.length + results.files.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Search</h1>
        <form action="/search" method="get" className="mt-3 space-y-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search hymns, series, videos…"
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="category"
              defaultValue={category ?? ""}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {filterOptions.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              name="speaker"
              defaultValue={speaker ?? ""}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            >
              <option value="">All speakers</option>
              {filterOptions.speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              name="sort"
              defaultValue={sortValue}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            >
              <option value="relevance">Most relevant</option>
              <option value="newest">Newest first</option>
            </select>
            <button
              type="submit"
              className="rounded-md btn-primary text-white px-4 py-1.5 text-sm"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {!query && <p className="text-sec">Enter a search term above.</p>}
      {query && !hasResults && <p className="text-sec">No results for &ldquo;{query}&rdquo;.</p>}

      {results.categories.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Categories</h2>
          <div className="space-y-3">
            {results.categories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {results.series.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Series</h2>
          <div className="space-y-3">
            {results.series.map((series) => (
              <SeriesTile key={series.id} series={series} />
            ))}
          </div>
        </section>
      )}

      {results.files.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Hymns &amp; books</h2>
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {results.files.map((file) => (
              <li key={file.id}>
                <Link href={file.href} className="flex items-start gap-3 px-3 py-2.5 hover:bg-hover">
                  {/* The printed number, where the book has one — it is how
                      this hymn is asked for out loud. */}
                  <span className="w-8 shrink-0 pt-0.5 text-right text-sm tabular-nums text-ter">
                    {file.pageNumber ?? ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.title}</span>
                    {file.context && <span className="block text-xs text-sec">{file.context}</span>}
                    {/* The line they searched for, in the words the book
                        prints — which is usually all the confirmation
                        anybody needs that this is the right hymn. */}
                    {file.excerpt && (
                      <span className="mt-0.5 block text-xs text-sec italic">{file.excerpt}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Videos</h2>
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
