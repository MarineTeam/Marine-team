import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getPlaylist, getPublicPlaylist } from "@/lib/content";
import { getDisplayName } from "@/lib/profile";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { PlaylistDetail } from "@/components/playlist-detail";
import { MenuTile } from "@/components/menu-tile";
import { ShareButtons } from "@/components/share-buttons";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const owned = user ? await getPlaylist(id, user.id) : null;
  if (owned) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <PlaylistDetail
          playlist={{
            ...owned,
            items: owned.items.map((item) => ({
              ...item,
              video: {
                ...item.video,
                thumbnailUrl: bunnyStreamThumbnailUrl(item.video.bunnyVideoId, item.video.thumbnailFileName),
              },
            })),
          }}
        />
      </div>
    );
  }

  const publicPlaylist = await getPublicPlaylist(id);
  if (!publicPlaylist) {
    if (!user) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="font-medium">Log in to see this playlist.</p>
          <a
            href="/auth/login"
            className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
          >
            Log in
          </a>
        </div>
      );
    }
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/playlists" className="text-sm text-sec hover:underline">
          ← Playlists
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">{publicPlaylist.title}</h1>
            <p className="text-sm text-sec">by {getDisplayName(publicPlaylist.user)}</p>
          </div>
          <ShareButtons title={publicPlaylist.title} path={`/playlists/${publicPlaylist.id}`} />
        </div>
      </div>

      {publicPlaylist.items.length === 0 ? (
        <p className="text-sec">This playlist is empty.</p>
      ) : (
        <div className="space-y-3">
          {publicPlaylist.items.map((item) => (
            <MenuTile
              key={item.id}
              href={`/videos/${item.video.slug}`}
              title={item.video.title}
              subtitle={item.video.series?.title}
              thumbnailUrl={bunnyStreamThumbnailUrl(item.video.bunnyVideoId, item.video.thumbnailFileName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
