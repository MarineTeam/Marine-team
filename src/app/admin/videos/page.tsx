"use client";

import { useEffect, useState } from "react";
import { Upload } from "tus-js-client";

type Series = { id: string; title: string };
type Video = {
  id: string;
  title: string;
  slug: string;
  status: "PROCESSING" | "READY" | "FAILED";
  memberOnly: boolean;
  published: boolean;
  series: { id: string; title: string } | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function VideosAdminPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [title, setTitle] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [videosRes, seriesRes] = await Promise.all([
      fetch("/api/admin/videos"),
      fetch("/api/admin/series"),
    ]);
    if (videosRes.ok) setVideos(await videosRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function uploadVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);

    try {
      const createRes = await fetch("/api/admin/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug: slugify(title), seriesId: seriesId || null }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Failed to create");
      const { video, upload } = await createRes.json();

      await new Promise<void>((resolve, reject) => {
        const tusUpload = new Upload(file, {
          endpoint: upload.endpoint,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            AuthorizationSignature: upload.signature,
            AuthorizationExpire: String(upload.expirationTime),
            VideoId: upload.videoId,
            LibraryId: upload.libraryId,
          },
          metadata: { filetype: file.type, title },
          onError: reject,
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        tusUpload.start();
      });

      await fetch(`/api/admin/videos/${video.id}/sync-status`, { method: "POST" });

      setTitle("");
      setSeriesId("");
      setFile(null);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  async function refreshStatus(id: string) {
    await fetch(`/api/admin/videos/${id}/sync-status`, { method: "POST" });
    await load();
  }

  async function toggle(v: Video, field: "published" | "memberOnly") {
    await fetch(`/api/admin/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !v[field] }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this video? This also removes it from Bunny Stream.")) return;
    await fetch(`/api/admin/videos/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Videos</h1>

      <form
        onSubmit={uploadVideo}
        className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex items-center gap-3">
          <select
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No series</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            required
          />
          <button
            type="submit"
            disabled={progress !== null}
            className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Upload
          </button>
        </div>
        {progress !== null && (
          <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-2 rounded-full bg-zinc-900 dark:bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {videos.map((v) => (
          <li key={v.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{v.title}</p>
              <p className="text-sm text-zinc-500">
                {v.series?.title ?? "No series"} · {v.status}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {v.status !== "READY" && (
                <button
                  onClick={() => refreshStatus(v.id)}
                  className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                >
                  Refresh status
                </button>
              )}
              <button
                onClick={() => toggle(v, "published")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {v.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => toggle(v, "memberOnly")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {v.memberOnly ? "Members only" : "Public"}
              </button>
              <button onClick={() => remove(v.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {videos.length === 0 && <li className="p-4 text-sm text-zinc-500">No videos yet.</li>}
      </ul>
    </div>
  );
}
