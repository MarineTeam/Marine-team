"use client";

import { useEffect, useState } from "react";

type Series = { id: string; title: string };
type FileAsset = {
  id: string;
  title: string;
  url: string;
  memberOnly: boolean;
  published: boolean;
  series: { id: string; title: string } | null;
};

/**
 * Manages downloadable files: upload, publish/visibility toggles, delete.
 * Pass `seriesId` to scope this to one series' handouts (series detail
 * page); omit it for the global "All files" view with a series picker.
 */
export function FileManager({ seriesId }: { seriesId?: string }) {
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [title, setTitle] = useState("");
  const [pickedSeriesId, setPickedSeriesId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [filesRes, seriesRes] = await Promise.all([
      fetch("/api/admin/files"),
      fetch("/api/admin/series"),
    ]);
    if (filesRes.ok) setFiles(await filesRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function uploadFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      const targetSeriesId = seriesId ?? pickedSeriesId;
      if (targetSeriesId) form.append("seriesId", targetSeriesId);
      const res = await fetch("/api/admin/files", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      setTitle("");
      setPickedSeriesId("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function toggle(f: FileAsset, field: "published" | "memberOnly") {
    await fetch(`/api/admin/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !f[field] }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this file? This also removes it from Bunny Storage.")) return;
    await fetch(`/api/admin/files/${id}`, { method: "DELETE" });
    await load();
  }

  const visibleFiles = seriesId ? files.filter((f) => f.series?.id === seriesId) : files;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{seriesId ? "Files" : "All files"}</h2>

      <form
        onSubmit={uploadFile}
        className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="File title"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex items-center gap-3">
          {!seriesId && (
            <select
              value={pickedSeriesId}
              onChange={(e) => setPickedSeriesId(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No series</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            required
          />
          <button
            type="submit"
            disabled={uploading}
            className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Upload
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Max 4MB (server upload limit). For larger files, upload via the Bunny dashboard and link
          the URL directly.
        </p>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {visibleFiles.map((f) => (
          <li key={f.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{f.title}</p>
              {!seriesId && (
                <p className="text-sm text-zinc-500">{f.series?.title ?? "No series"}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => toggle(f, "published")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {f.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => toggle(f, "memberOnly")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {f.memberOnly ? "Members only" : "Public"}
              </button>
              <button onClick={() => remove(f.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {visibleFiles.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">
            {seriesId ? "No files in this series yet." : "No files yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
