"use client";

import { useState } from "react";

type PlaylistOption = { id: string; title: string; hasVideo: boolean };

export function AddToPlaylistButton({ videoId }: { videoId: string }) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const res = await fetch(`/api/playlists/for-video?videoId=${videoId}`);
    if (res.ok) setPlaylists(await res.json());
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && playlists === null) await load();
  }

  async function toggleMembership(playlist: PlaylistOption) {
    setPending(true);
    try {
      await fetch(`/api/playlists/${playlist.id}/items`, {
        method: playlist.hasVideo ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      await load();
    } finally {
      setPending(false);
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        await fetch(`/api/playlists/${created.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        setNewTitle("");
        await load();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        + Playlist
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Save to playlist</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {playlists?.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.hasVideo}
                  disabled={pending}
                  onChange={() => toggleMembership(p)}
                />
                <span className="truncate">{p.title}</span>
              </label>
            ))}
            {playlists?.length === 0 && <p className="text-sm text-zinc-500">No playlists yet.</p>}
          </div>
          <form onSubmit={createAndAdd} className="mt-2 flex gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New playlist…"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-2 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
