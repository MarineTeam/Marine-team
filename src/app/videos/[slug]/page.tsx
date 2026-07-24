import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideoBySlug, canAccess } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamEmbedUrl } from "@/lib/bunny";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [video, user] = await Promise.all([getVideoBySlug(slug), getCurrentUser()]);

  if (!video) notFound();

  const isLoggedIn = Boolean(user);
  if (!canAccess(video.memberOnly, isLoggedIn)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">This video is for members only.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in to watch
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
      {video.series && (
        <Link
          href={`/series/${video.series.slug}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← {video.series.title}
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>

      {video.bunnyLibraryId === "demo" ? (
        <div className="aspect-video relative overflow-hidden rounded-lg bg-zinc-900 text-white">
          {video.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
          )}
          <div className="relative flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="rounded-full bg-white/90 p-4 text-zinc-900">▶</span>
            <p className="font-medium">Demo entry — no Bunny Stream video attached</p>
            <p className="text-sm text-zinc-300 max-w-sm">
              In production this plays through the embedded Bunny Stream player.
            </p>
          </div>
        </div>
      ) : video.status === "READY" ? (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            src={bunnyStreamEmbedUrl(video.bunnyVideoId)}
            className="h-full w-full"
            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="aspect-video flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
          This video is still processing. Please check back soon.
        </div>
      )}

      {video.description && <p className="text-zinc-600 dark:text-zinc-400">{video.description}</p>}
    </div>
  );
}
