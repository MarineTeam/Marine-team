import Link from "next/link";
import { MenuTile } from "@/components/menu-tile";
import { getVideosByScriptureBook } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

export default async function ScriptureBookPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book } = await params;
  const user = await getCurrentUser();
  const decoded = decodeURIComponent(book);
  const videos = await getVideosByScriptureBook(decoded, Boolean(user));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/scripture" className="text-sm text-zinc-500 hover:underline">
          ← Browse by scripture
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{decoded}</h1>
      </div>

      {videos.length === 0 ? (
        <p className="text-zinc-500">No videos reference {decoded} yet.</p>
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
              tags={v.scriptureRefs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
