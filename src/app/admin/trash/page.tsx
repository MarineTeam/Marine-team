"use client";

import { useEffect, useState } from "react";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  bulkFetch,
  runBulk,
  useBulkSelect,
} from "@/components/bulk-select";

type Trashed = {
  categories: { id: string; name: string; deletedAt: string }[];
  series: { id: string; title: string; deletedAt: string; category: { name: string } | null }[];
  videos: { id: string; title: string; deletedAt: string; series: { title: string } | null; category: { name: string } | null }[];
  files: { id: string; title: string; deletedAt: string; series: { title: string } | null; category: { name: string } | null }[];
};

type ItemType = "category" | "series" | "video" | "file";

/** What permanently deleting this kind of thing also takes with it, for the confirm prompt. */
function purgeWarning(type: ItemType): string {
  if (type === "video") return " and removes it from Bunny Stream";
  if (type === "file") return " and removes it from Bunny Storage";
  return "";
}

function Section<T extends { id: string; deletedAt: string }>({
  title,
  items,
  type,
  label,
  subtitle,
  onChanged,
}: {
  title: string;
  items: T[];
  type: ItemType;
  label: (item: T) => string;
  subtitle?: (item: T) => string | null;
  onChanged: () => Promise<void>;
}) {
  // Per-section rather than one selection across the page: restoring and
  // purging are per-type endpoints, and "select all" plainly means this
  // list, not everything in the trash.
  const bulk = useBulkSelect(items.map((item) => item.id));
  const [busy, setBusy] = useState(false);

  async function restore(ids: string[]) {
    setBusy(true);
    await runBulk(ids, (id) => bulkFetch(`/api/admin/trash/${type}/${id}`, { method: "POST" }));
    bulk.clear();
    setBusy(false);
    await onChanged();
  }

  async function purge(ids: string[], prompt: string) {
    if (!confirm(prompt)) return;
    setBusy(true);
    await runBulk(ids, (id) => bulkFetch(`/api/admin/trash/${type}/${id}`, { method: "DELETE" }));
    bulk.clear();
    setBusy(false);
    await onChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
        {items.length > 0 && (
          <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={busy} />
        )}
      </div>

      {bulk.count > 0 && (
        <div className="mt-2">
          <BulkBar count={bulk.count} onClear={bulk.clear} busy={busy}>
            <BulkButton onClick={() => restore(bulk.selected)}>Restore</BulkButton>
            <BulkButton
              danger
              onClick={() =>
                purge(
                  bulk.selected,
                  `Permanently delete ${bulk.count} item${bulk.count === 1 ? "" : "s"}? This can't be undone${purgeWarning(type)}.`,
                )
              }
            >
              Delete permanently
            </BulkButton>
          </BulkBar>
        </div>
      )}

      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {items.map((item) => (
          <li key={item.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <BulkCheckbox
                checked={bulk.isSelected(item.id)}
                onChange={() => bulk.toggle(item.id)}
                label={label(item)}
              />
              <div className="min-w-0">
                <p className="font-medium">{label(item)}</p>
                <p className="text-xs text-zinc-500">
                  {subtitle?.(item) ? `${subtitle(item)} · ` : ""}
                  Deleted {new Date(item.deletedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => restore([item.id])}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                Restore
              </button>
              <button
                onClick={() =>
                  purge(
                    [item.id],
                    `Permanently delete "${label(item)}"? This can't be undone${purgeWarning(type)}.`,
                  )
                }
                className="text-red-600 hover:underline"
              >
                Delete permanently
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-sm text-zinc-500">Nothing here.</li>}
      </ul>
    </div>
  );
}

export default function TrashAdminPage() {
  const [data, setData] = useState<Trashed | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/trash");
    if (res.ok) setData(await res.json());
    else setError((await res.json()).error ?? "Failed to load");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Trash</h1>
        <p className="text-sm text-zinc-500">
          Deleted categories, series, videos, and files land here instead of being removed immediately. Restore
          brings an item back exactly as it was; permanent delete can&apos;t be undone, and for videos/files also
          removes the underlying file from Bunny.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="space-y-6">
          <Section
            title="Categories"
            type="category"
            items={data.categories}
            label={(c) => c.name}
            onChanged={load}
          />
          <Section
            title="Series"
            type="series"
            items={data.series}
            label={(s) => s.title}
            subtitle={(s) => s.category?.name ?? null}
            onChanged={load}
          />
          <Section
            title="Videos"
            type="video"
            items={data.videos}
            label={(v) => v.title}
            subtitle={(v) => v.series?.title ?? v.category?.name ?? null}
            onChanged={load}
          />
          <Section
            title="Files"
            type="file"
            items={data.files}
            label={(f) => f.title}
            subtitle={(f) => f.series?.title ?? f.category?.name ?? null}
            onChanged={load}
          />
        </div>
      )}
    </div>
  );
}
