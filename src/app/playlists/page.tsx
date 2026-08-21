import { getCurrentUser } from "@/lib/current-user";
import { PlaylistsManager } from "@/components/playlists-manager";

export default async function PlaylistsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your playlists.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Log in
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Playlists</h1>
      <PlaylistsManager />
    </div>
  );
}
