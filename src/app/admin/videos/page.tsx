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
type BunnyLibraryVideo = {
  guid: string;
  title: string;
  status: number;
  length: number;
  dateUploaded: string;
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

  const [showImport, setShowImport] = useState(false);
  const [bunnyLibrary, setBunnyLibrary] = useState<BunnyLibraryVideo[] | null>(null);
  const [bunnyLoading, setBunnyLoading] = useState(false);
  const [importDrafts, setImportDrafts] = useState<
    Record<string, { title: string; slug: string; seriesId: string }>
  >({});
  const [importingGuid, setImportingGuid] = useState<string | null>(null);

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

  async function loadBunnyLibrary() {
    setBunnyLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/videos/bunny-library");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to list Bunny videos");
      const items: BunnyLibraryVideo[] = await res.json();
      setBunnyLibrary(items);
      setImportDrafts(
        Object.fromEntries(
          items.map((v) => [
            v.guid,
            { title: v.title, slug: slugify(v.title), seriesId: "" },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list Bunny videos");
    } finally {
      setBunnyLoading(false);
    }
  }

  function updateDraft(guid: string, field: "title" | "slug" | "seriesId", value: string) {
    setImportDrafts((prev) => ({ ...prev, [guid]: { ...prev[guid], [field]: value } }));
  }

  async function importVideo(guid: string) {
    const draft = importDrafts[guid];
    if (!draft?.title.trim() || !draft?.slug.trim()) {
      setError("Title and slug are required to import a video");
      return;
    }
    setImportingGuid(guid);
    setError(null);
    try {
      const res = await fetch("/api/admin/videos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bunnyVideoId: guid,
          title: draft.title,
          slug: draft.slug,
          seriesId: draft.seriesId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      setBunnyLibrary((prev) => prev?.filter((v) => v.guid !== guid) ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingGuid(null);
    }
  }

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

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Import existing Bunny videos</h2>
          <button
            onClick={() => {
              const next = !showImport;
              setShowImport(next);
              if (next && bunnyLibrary === null) loadBunnyLibrary();
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {showImport ? "Hide" : "Show"}
          </button>
        </div>

        {showImport && (
          <div className="space-y-3">
            <button
              onClick={loadBunnyLibrary}
              disabled={bunnyLoading}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              {bunnyLoading ? "Checking…" : "Check for new videos"}
            </button>

            {bunnyLibrary?.length === 0 && (
              <p className="text-sm text-zinc-500">
                Everything already in your Bunny Stream library has been imported.
              </p>
            )}

            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
              {bunnyLibrary?.map((v) => {
                const draft = importDrafts[v.guid];
                return (
                  <li key={v.guid} className="p-3 space-y-2">
                    <p className="text-sm text-zinc-500">
                      Bunny: {v.title} · uploaded {new Date(v.dateUploaded).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={draft?.title ?? ""}
                        onChange={(e) => updateDraft(v.guid, "title", e.target.value)}
                        placeholder="Title"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <input
                        value={draft?.slug ?? ""}
                        onChange={(e) => updateDraft(v.guid, "slug", e.target.value)}
                        placeholder="slug"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <select
                        value={draft?.seriesId ?? ""}
                        onChange={(e) => updateDraft(v.guid, "seriesId", e.target.value)}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">No series</option>
                        {seriesList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => importVideo(v.guid)}
                        disabled={importingGuid === v.guid}
                        className="ml-auto rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                      >
                        {importingGuid === v.guid ? "Importing…" : "Import"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

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
