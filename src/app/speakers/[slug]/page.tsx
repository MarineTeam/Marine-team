import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuTile } from "@/components/menu-tile";
import { getSpeakerBySlug } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { truncateDescription } from "@/lib/seo";

// Speaker bios and photos are public regardless of login state — the
// videos list below badges member-only entries individually rather than
// gating the whole page, so metadata needs no visibility check.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getCurrentUser();
  const data = await getSpeakerBySlug(slug, Boolean(user));
  if (!data) return {};
  const { speaker } = data;

  const description = speaker.bio
    ? truncateDescription(speaker.bio)
    : `Watch videos from ${speaker.name} on Marine Team.`;

  return {
    title: speaker.name,
    description,
    openGraph: {
      title: speaker.name,
      description,
      images: speaker.photoUrl ? [speaker.photoUrl] : undefined,
    },
    twitter: {
      card: speaker.photoUrl ? "summary_large_image" : "summary",
      title: speaker.name,
      description,
      images: speaker.photoUrl ? [speaker.photoUrl] : undefined,
    },
  };
}

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
      <Link href="/speakers" className="text-sm text-sec hover:underline">
        ← Speakers
      </Link>

      <div className="flex items-center gap-4">
        {speaker.photoUrl && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-chip">
            <Image src={speaker.photoUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{speaker.name}</h1>
          {speaker.bio && <p className="mt-1 text-sec">{speaker.bio}</p>}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="text-sec">No videos from {speaker.name} yet.</p>
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
