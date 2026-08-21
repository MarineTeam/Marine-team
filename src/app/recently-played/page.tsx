import { getCurrentUser } from "@/lib/current-user";
import { getRecentlyPlayed } from "@/lib/content";
import { MenuTile } from "@/components/menu-tile";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function RecentlyPlayedPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see what you&apos;ve been watching.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Log in
        </a>
      </div>
    );
  }

  const recentlyPlayed = await getRecentlyPlayed(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Recently Played</h1>

      {recentlyPlayed.length === 0 ? (
        <p className="text-sec">
          Nothing watched yet — videos you start playing will show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {recentlyPlayed.map((entry) => (
            <MenuTile
              key={entry.id}
              href={`/videos/${entry.video.slug}`}
              title={entry.video.title}
              subtitle={entry.video.series?.title}
              thumbnailUrl={bunnyStreamThumbnailUrl(entry.video.bunnyVideoId, entry.video.thumbnailFileName)}
              badge={entry.completed ? "Watched" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
