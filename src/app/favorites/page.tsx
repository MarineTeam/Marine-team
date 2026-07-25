import { getCurrentUser } from "@/lib/current-user";
import { getFavorites } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function FavoritesPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your favorites.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in
        </a>
      </div>
    );
  }

  const { seriesFavorites, videoFavorites } = await getFavorites(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">My Favorites</h1>

      {seriesFavorites.length === 0 && videoFavorites.length === 0 && (
        <p className="text-zinc-500">
          Nothing favorited yet — look for the ☆ Favorite button on a series or video.
        </p>
      )}

      {seriesFavorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Series</h2>
          <div className="space-y-3">
            {seriesFavorites.map((f) => (
              <SeriesTile key={f.id} series={f.series} />
            ))}
          </div>
        </section>
      )}

      {videoFavorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Videos</h2>
          <div className="space-y-3">
            {videoFavorites.map((f) => (
              <MenuTile
                key={f.id}
                href={`/videos/${f.video.slug}`}
                title={f.video.title}
                subtitle={f.video.series?.title}
                thumbnailUrl={bunnyStreamThumbnailUrl(f.video.bunnyVideoId)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
