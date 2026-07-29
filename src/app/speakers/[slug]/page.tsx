import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuTile } from "@/components/menu-tile";
import { getSpeakerBySlug } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function SpeakerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const data = await getSpeakerBySlug(slug, Boolean(user));
  if (!data) notFound();
  const { speaker, videos } = data;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <Link href="/speakers" className="text-sm text-zinc-500 hover:underline">
        ← Speakers
      </Link>

      <div className="flex items-center gap-4">
        {speaker.photoUrl && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Image src={speaker.photoUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{speaker.name}</h1>
          {speaker.bio && <p className="mt-1 text-zinc-500">{speaker.bio}</p>}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="text-zinc-500">No videos from {speaker.name} yet.</p>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => (
            <MenuTile
              key={v.id}
              href={`/videos/${v.slug}`}
              title={v.title}
              subtitle={v.series?.title ?? v.description}
              thumbnailUrl={bunnyStreamThumbnailUrl(v.bunnyVideoId, v.thumbnailFileName)}
              badge={v.memberOnly ? "Members" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
