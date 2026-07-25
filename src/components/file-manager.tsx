"use client";

import { useEffect, useState } from "react";
import { DragHandle, PositionInput, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";

type Series = { id: string; title: string };
type FileAsset = {
  id: string;
  title: string;
  url: string;
  memberOnly: boolean;
  published: boolean;
  unpublishAt: string | null;
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
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  async function setExpiry(f: FileAsset) {
    const input = prompt(
      "Unpublish this file at (YYYY-MM-DDTHH:MM, local time)? Leave blank to clear.",
      "",
    );
    if (input === null) return;
    const unpublishAt = input.trim() ? new Date(input.trim()).toISOString() : null;
    await fetch(`/api/admin/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unpublishAt }),
    });
    await load();
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

  async function reassignSeries(id: string, newSeriesId: string) {
    await fetch(`/api/admin/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: newSeriesId || null }),
    });
    await load();
  }

  const scopedFiles = seriesId ? files.filter((f) => f.series?.id === seriesId) : files;
  const visibleFiles =
    !seriesId && query.trim()
      ? scopedFiles.filter((f) => f.title.toLowerCase().includes(query.trim().toLowerCase()))
      : scopedFiles;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSetPublished(published: boolean) {
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/files/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published }),
        }),
      ),
    );
    setSelectedIds(new Set());
    await load();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} file(s)? This also removes them from Bunny Storage.`))
      return;
    await Promise.all(
      Array.from(selectedIds).map((id) => fetch(`/api/admin/files/${id}`, { method: "DELETE" })),
    );
    setSelectedIds(new Set());
    await load();
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(visibleFiles, fromIndex, toIndex);
    await Promise.all(
      reordered.map((f, i) =>
        fetch(`/api/admin/files/${f.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  async function move(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visibleFiles.length) return;
    await reorderTo(index, targetIndex);
  }

  const { draggingIndex, handleProps, dropZoneProps } = useDragReorder(reorderTo);

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
        <div className="flex flex-wrap items-center gap-3">
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
            className="text-sm max-w-full"
            required
          />
          <button
            type="submit"
            disabled={uploading}
            className="sm:ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
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

      {!seriesId && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files by title…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span>{selectedIds.size} selected</span>
          <button
            onClick={() => bulkSetPublished(true)}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            Publish
          </button>
          <button
            onClick={() => bulkSetPublished(false)}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            Unpublish
          </button>
          <button onClick={bulkDelete} className="rounded-md border border-red-300 px-2 py-1 text-red-600 dark:border-red-900">
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {visibleFiles.map((f, index) => (
          <li
            key={f.id}
            className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 ${draggingIndex === index ? "opacity-40" : ""}`}
            {...(seriesId ? dropZoneProps(index) : {})}
          >
            <div className="min-w-0 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(f.id)}
                onChange={() => toggleSelected(f.id)}
                aria-label={`Select ${f.title}`}
              />
              {seriesId && <DragHandle {...handleProps(index)} />}
              <div className="min-w-0">
                <p className="font-medium">{f.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {seriesId && (
                <>
                  <PositionInput
                    index={index}
                    total={visibleFiles.length}
                    onReorder={(toIndex) => reorderTo(index, toIndex)}
                  />
                  <button
                    onClick={() => move(index, "up")}
                    disabled={index === 0}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, "down")}
                    disabled={index === visibleFiles.length - 1}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </>
              )}
              {!seriesId && (
                <select
                  value={f.series?.id ?? ""}
                  onChange={(e) => reassignSeries(f.id, e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">No series</option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => toggle(f, "published")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {f.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => setExpiry(f)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${f.unpublishAt ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
                title={f.unpublishAt ? `Unpublishes ${new Date(f.unpublishAt).toLocaleString()}` : undefined}
              >
                {f.unpublishAt ? "Expires" : "Set expiry"}
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
