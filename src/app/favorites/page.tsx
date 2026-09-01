import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getFavorites } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";
import { MenuTile } from "@/components/menu-tile";
import { fileHref } from "@/lib/hymnal";
import { videoThumbnailUrl } from "@/lib/video-source";

export default async function FavoritesPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your favorites.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Log in
        </a>
      </div>
    );
  }

  const { seriesFavorites, videoFavorites, fileFavorites } = await getFavorites(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">My Favorites</h1>

      {seriesFavorites.length === 0 && videoFavorites.length === 0 && fileFavorites.length === 0 && (
        <p className="text-sec">
          Nothing favorited yet — look for the ☆ Favorite button on a hymn, a series or a video.
        </p>
      )}

      {fileFavorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Hymns &amp; books</h2>
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {fileFavorites.map((favorite) => {
              const href = fileHref(favorite.file);
              const row = (
                <>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ter">
                    {favorite.file.pageNumber ?? ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{favorite.file.title}</span>
                    <span className="block text-xs text-sec">
                      {favorite.file.series?.title ?? favorite.file.category?.name ?? ""}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={favorite.id}>
                  {/* A favourited file whose page has since gone (its series
                      stopped being hymn-per-file, say) still lists — it just
                      doesn't pretend to lead anywhere. */}
                  {href ? (
                    <Link href={href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {seriesFavorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Series</h2>
          <div className="space-y-3">
            {seriesFavorites.map((f) => (
              <SeriesTile key={f.id} series={f.series} />
            ))}
          </div>
        </section>
      )}

      {videoFavorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Videos</h2>
          <div className="space-y-3">
            {videoFavorites.map((f) => (
              <MenuTile
                key={f.id}
                href={`/videos/${f.video.slug}`}
                title={f.video.title}
                subtitle={f.video.series?.title}
                thumbnailUrl={videoThumbnailUrl(f.video)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
