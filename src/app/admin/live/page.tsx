"use client";

import { useEffect, useState } from "react";

type LiveStream = {
  id: string;
  title: string;
  description: string | null;
  embedUrl: string;
  coverImageUrl: string | null;
  published: boolean;
  startAt: string;
  endAt: string | null;
};

export default function LiveAdminPage() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [title, setTitle] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/live");
    if (res.ok) setStreams(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          embedUrl,
          startAt: new Date(startAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to schedule stream");
      setTitle("");
      setEmbedUrl("");
      setStartAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule stream");
    }
  }

  async function toggle(s: LiveStream) {
    await fetch(`/api/admin/live/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !s.published }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this live stream?")) return;
    await fetch(`/api/admin/live/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Live streaming</h1>
        <p className="text-sm text-zinc-500">
          Points at a stream already embedded elsewhere (YouTube, Boxcast, etc.) — Bunny Stream has no live
          ingest. Publishing a stream sends a push notification (&ldquo;Live now&rdquo;) if the Live streaming
          plugin is enabled in{" "}
          <a href="/admin/plugins" className="underline">
            Plugins
          </a>
          . <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/live</code> shows the current or next
          published stream automatically based on start/end time.
        </p>
      </div>

      <form onSubmit={create} className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Stream title"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <input
          value={embedUrl}
          onChange={(e) => setEmbedUrl(e.target.value)}
          placeholder="Embed URL (e.g. https://www.youtube.com/embed/VIDEO_ID)"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-500">
            Starts
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="ml-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </label>
          <button
            type="submit"
            className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Schedule
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {streams.map((s) => (
          <li key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-zinc-500">
                {new Date(s.startAt).toLocaleString()} · {s.embedUrl}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => toggle(s)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${s.published ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}
              >
                {s.published ? "Published" : "Draft"}
              </button>
              <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {streams.length === 0 && <li className="p-4 text-sm text-zinc-500">No live streams scheduled yet.</li>}
      </ul>
    </div>
  );
}
