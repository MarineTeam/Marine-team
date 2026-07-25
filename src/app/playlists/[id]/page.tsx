import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getPlaylist } from "@/lib/content";
import { PlaylistDetail } from "@/components/playlist-detail";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see this playlist.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in
        </a>
      </div>
    );
  }

  const playlist = await getPlaylist(id, user.id);
  if (!playlist) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <PlaylistDetail playlist={playlist} />
    </div>
  );
}
