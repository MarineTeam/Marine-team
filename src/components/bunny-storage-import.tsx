"use client";

import { useState } from "react";
import { titleFromFilename } from "@/lib/filename";
import {
  TargetSelect,
  parseTarget,
  type SeriesOption,
  type CategoryOption,
} from "@/components/content-target-picker";

type StorageObject = {
  path: string;
  name: string;
  sizeBytes: number;
  contentType: string | null;
  lastChanged: string | null;
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Adopts files already sitting in Bunny Storage.
 *
 * The app's own upload runs through a serverless function capped at 4MB, so
 * anything bigger has to go to Bunny directly — which leaves the object
 * there with nothing in the database pointing at it. This lists exactly
 * those and turns the chosen ones into files, the same way the video admin
 * imports from an existing Bunny Stream library.
 */
export function BunnyStorageImport({
  seriesId,
  categoryId,
  seriesList,
  categoryList,
  onImported,
}: {
  seriesId?: string;
  categoryId?: string;
  seriesList: SeriesOption[];
  categoryList: CategoryOption[];
  onImported: () => Promise<void> | void;
}) {
  const scoped = Boolean(seriesId || categoryId);
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState<StorageObject[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedTarget, setPickedTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function scan() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/files/bunny-storage");
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't read Bunny Storage");
      const found: StorageObject[] = await res.json();
      setObjects(found);
      // Titles default to the filename, and stay editable until import —
      // the same treatment the upload queue gives a picked file.
      setTitles(Object.fromEntries(found.map((o) => [o.path, titleFromFilename(o.name)])));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read Bunny Storage");
    } finally {
      setLoading(false);
    }
  }

  function toggle(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function importSelected() {
    if (selected.size === 0) return;
    const target = scoped
      ? { seriesId: seriesId ?? null, categoryId: categoryId ?? null }
      : parseTarget(pickedTarget);

    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: Array.from(selected).map((path) => ({
            path,
            title: titles[path]?.trim() || path.split("/").pop() || path,
          })),
          seriesId: target.seriesId,
          categoryId: target.categoryId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      const data: { imported: number; skipped: number } = await res.json();
      setResult(
        `Imported ${data.imported} file${data.imported === 1 ? "" : "s"}` +
          (data.skipped > 0 ? ` (${data.skipped} already imported)` : ""),
      );
      // Re-scanned rather than filtered in place, so the list reflects what
      // Bunny actually holds now — including anything another admin took.
      await Promise.all([scan(), onImported()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            if (!open && objects === null) void scan();
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {open ? "Hide" : "Import from Bunny Storage"}
        </button>
        {open && (
          <button
            type="button"
            onClick={scan}
            disabled={loading}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Rescan"}
          </button>
        )}
        {result && <span className="text-sm text-green-600">{result}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-500">
            Files uploaded straight to Bunny (bigger than the 4MB limit above) show up here until
            they&apos;re added to the library.
          </p>

          {loading && objects === null && <p className="text-sm text-zinc-500">Scanning…</p>}

          {objects !== null && objects.length === 0 && !loading && (
            <p className="text-sm text-zinc-500">
              Nothing new in Bunny Storage — every file there is already in the library.
            </p>
          )}

          {objects !== null && objects.length > 0 && (
            <>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {objects.map((object) => (
                  <li key={object.path} className="flex flex-wrap items-center gap-2 p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(object.path)}
                      onChange={() => toggle(object.path)}
                      aria-label={`Select ${object.name}`}
                    />
                    <input
                      value={titles[object.path] ?? ""}
                      onChange={(e) =>
                        setTitles((current) => ({ ...current, [object.path]: e.target.value }))
                      }
                      aria-label={`Title for ${object.name}`}
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <span
                      className="w-56 shrink-0 truncate text-xs text-zinc-500"
                      title={object.path}
                    >
                      {object.path}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
                      {formatSize(object.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      current.size === objects.length
                        ? new Set()
                        : new Set(objects.map((o) => o.path)),
                    )
                  }
                  className="text-sm text-zinc-500 hover:underline"
                >
                  {selected.size === objects.length ? "Clear selection" : "Select all"}
                </button>
                {!scoped && (
                  <TargetSelect
                    value={pickedTarget}
                    onChange={setPickedTarget}
                    seriesList={seriesList}
                    categoryList={categoryList}
                  />
                )}
                <button
                  type="button"
                  onClick={importSelected}
                  disabled={importing || selected.size === 0}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  {importing ? "Importing…" : `Import ${selected.size || ""}`.trim()}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
