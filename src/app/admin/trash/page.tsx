"use client";

import { useEffect, useState } from "react";

type Trashed = {
  categories: { id: string; name: string; deletedAt: string }[];
  series: { id: string; title: string; deletedAt: string; category: { name: string } | null }[];
  videos: { id: string; title: string; deletedAt: string; series: { title: string } | null; category: { name: string } | null }[];
  files: { id: string; title: string; deletedAt: string; series: { title: string } | null; category: { name: string } | null }[];
};

type ItemType = "category" | "series" | "video" | "file";

function Section<T extends { id: string; deletedAt: string }>({
  title,
  items,
  type,
  label,
  subtitle,
  onRestore,
  onPurge,
}: {
  title: string;
  items: T[];
  type: ItemType;
  label: (item: T) => string;
  subtitle?: (item: T) => string | null;
  onRestore: (type: ItemType, id: string) => void;
  onPurge: (type: ItemType, id: string, label: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {items.map((item) => (
          <li key={item.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{label(item)}</p>
              <p className="text-xs text-zinc-500">
                {subtitle?.(item) ? `${subtitle(item)} · ` : ""}
                Deleted {new Date(item.deletedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRestore(type, item.id)}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                Restore
              </button>
              <button onClick={() => onPurge(type, item.id, label(item))} className="text-red-600 hover:underline">
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

  async function restore(type: ItemType, id: string) {
    await fetch(`/api/admin/trash/${type}/${id}`, { method: "POST" });
    await load();
  }

  async function purge(type: ItemType, id: string, label: string) {
    if (
      !confirm(
        `Permanently delete "${label}"? This can't be undone${type === "video" ? " and removes it from Bunny Stream" : type === "file" ? " and removes it from Bunny Storage" : ""}.`,
      )
    )
      return;
    await fetch(`/api/admin/trash/${type}/${id}`, { method: "DELETE" });
    await load();
  }

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
            onRestore={restore}
            onPurge={purge}
          />
          <Section
            title="Series"
            type="series"
            items={data.series}
            label={(s) => s.title}
            subtitle={(s) => s.category?.name ?? null}
            onRestore={restore}
            onPurge={purge}
          />
          <Section
            title="Videos"
            type="video"
            items={data.videos}
            label={(v) => v.title}
            subtitle={(v) => v.series?.title ?? v.category?.name ?? null}
            onRestore={restore}
            onPurge={purge}
          />
          <Section
            title="Files"
            type="file"
            items={data.files}
            label={(f) => f.title}
            subtitle={(f) => f.series?.title ?? f.category?.name ?? null}
            onRestore={restore}
            onPurge={purge}
          />
        </div>
      )}
    </div>
  );
}
