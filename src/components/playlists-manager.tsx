"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Playlist = { id: string; title: string; items: { id: string }[] };

export function PlaylistsManager() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [title, setTitle] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch("/api/playlists");
    if (res.ok) setPlaylists(await res.json());
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (res.ok) {
      setTitle("");
      await load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this playlist?")) return;
    await fetch(`/api/playlists/${id}`, { method: "DELETE" });
    await load();
  }

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New playlist title…"
          className="flex-1 rounded-md border border-sep px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Create
        </button>
      </form>

      {playlists.length === 0 && (
        <p className="text-sec">
          No playlists yet. Create one above, or use the + Playlist button on any video.
        </p>
      )}

      <ul className="divide-y divide-sep rounded-lg border border-sep">
        {playlists.map((p) => (
          <li key={p.id} className="p-4 flex items-center justify-between gap-4">
            <Link href={`/playlists/${p.id}`} className="min-w-0">
              <p className="font-medium hover:underline">{p.title}</p>
              <p className="text-sm text-sec">
                {p.items.length} video{p.items.length === 1 ? "" : "s"}
              </p>
            </Link>
            <button onClick={() => remove(p.id)} className="text-red-600 hover:underline text-sm">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
