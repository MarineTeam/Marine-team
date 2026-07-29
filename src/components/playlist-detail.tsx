"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";
import { reorderArray } from "@/lib/reorder";

type Item = {
  id: string;
  video: {
    id: string;
    slug: string;
    title: string;
    bunnyVideoId: string;
    thumbnailFileName: string | null;
    series: { title: string } | null;
  };
};
type Playlist = { id: string; title: string; items: Item[] };

export function PlaylistDetail({ playlist: initial }: { playlist: Playlist }) {
  const router = useRouter();
  const [playlist, setPlaylist] = useState(initial);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(initial.title);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch(`/api/playlists/${playlist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (res.ok) {
      setPlaylist((p) => ({ ...p, title: title.trim() }));
      setRenaming(false);
    }
  }

  async function removeVideo(videoId: string) {
    await fetch(`/api/playlists/${playlist.id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    setPlaylist((p) => ({ ...p, items: p.items.filter((i) => i.video.id !== videoId) }));
  }

  async function move(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlist.items.length) return;
    const reordered = reorderArray(playlist.items, index, targetIndex);
    setPlaylist((p) => ({ ...p, items: reordered }));
    await fetch(`/api/playlists/${playlist.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: reordered.map((i) => i.id) }),
    });
  }

  async function remove() {
    if (!confirm("Delete this playlist?")) return;
    await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    router.push("/playlists");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/playlists" className="text-sm text-zinc-500 hover:underline">
          ← Playlists
        </Link>
        {renaming ? (
          <form onSubmit={rename} className="mt-1 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              autoFocus
            />
            <button type="submit" className="rounded-md bg-zinc-900 text-white px-3 py-2 text-sm dark:bg-white dark:text-zinc-900">
              Save
            </button>
          </form>
        ) : (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{playlist.title}</h1>
            <div className="flex gap-2">
              <button onClick={() => setRenaming(true)} className="text-sm text-zinc-500 hover:underline">
                Rename
              </button>
              <button onClick={remove} className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {playlist.items.length === 0 && (
        <p className="text-zinc-500">
          No videos in this playlist yet — use the + Playlist button on a video page to add one.
        </p>
      )}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {playlist.items.map((item, index) => (
          <li key={item.id} className="p-3 flex items-center gap-3">
            <div className="flex flex-col">
              <button
                onClick={() => move(index, "up")}
                disabled={index === 0}
                className="text-xs disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => move(index, "down")}
                disabled={index === playlist.items.length - 1}
                className="text-xs disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
            </div>
            {(() => {
              const thumbnailUrl = bunnyStreamThumbnailUrl(item.video.bunnyVideoId, item.video.thumbnailFileName);
              return thumbnailUrl ? (
                <Image
                  src={thumbnailUrl}
                  alt=""
                  width={96}
                  height={56}
                  className="h-14 w-24 shrink-0 rounded object-cover bg-zinc-100 dark:bg-zinc-800"
                />
              ) : (
                <div className="h-14 w-24 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />
              );
            })()}
            <Link href={`/videos/${item.video.slug}`} className="min-w-0 flex-1">
              <p className="font-medium truncate hover:underline">{item.video.title}</p>
              {item.video.series && <p className="text-sm text-zinc-500 truncate">{item.video.series.title}</p>}
            </Link>
            <button onClick={() => removeVideo(item.video.id)} className="text-sm text-red-600 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
