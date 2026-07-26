"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DragHandle, PositionInput } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";

type Category = { id: string; name: string };
type Series = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  memberOnly: boolean;
  hidden: boolean;
  published: boolean;
  featured: boolean;
  pinned: boolean;
  category: Category | null;
  _count: { videos: number; files: number };
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Groups series by category so up/down reordering stays within the same category's siblings. */
function groupByCategory(series: Series[]): { key: string; label: string; items: Series[] }[] {
  const groups = new Map<string, { label: string; items: Series[] }>();
  for (const s of series) {
    const key = s.categoryId ?? "__none";
    if (!groups.has(key)) groups.set(key, { label: s.category?.name ?? "Uncategorized", items: [] });
    groups.get(key)!.items.push(s);
  }
  return Array.from(groups.entries()).map(([key, g]) => ({ key, ...g }));
}

export default function SeriesAdminPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [memberOnly, setMemberOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function load() {
    const [seriesRes, categoriesRes] = await Promise.all([
      fetch("/api/admin/series"),
      fetch("/api/admin/categories"),
    ]);
    if (seriesRes.ok) setSeries(await seriesRes.json());
    if (categoriesRes.ok) setCategories(await categoriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createSeries(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slugify(title),
          categoryId: categoryId || null,
          memberOnly,
          published: true,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      setTitle("");
      setCategoryId("");
      setMemberOnly(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(s: Series, field: "published" | "memberOnly" | "hidden" | "featured" | "pinned") {
    await fetch(`/api/admin/series/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !s[field] }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this series? Its videos and files will be detached, not deleted."))
      return;
    await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
    await load();
  }

  async function reassignCategory(id: string, newCategoryId: string) {
    await fetch(`/api/admin/series/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: newCategoryId || null }),
    });
    await load();
  }

  async function bulkMoveToCategory(newCategoryId: string) {
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/series/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: newCategoryId || null }),
        }),
      ),
    );
    setSelectedIds(new Set());
    await load();
  }

  async function reorderTo(siblings: Series[], fromIndex: number, toIndex: number) {
    const reordered = reorderArray(siblings, fromIndex, toIndex);
    await Promise.all(
      reordered.map((s, i) =>
        fetch(`/api/admin/series/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  async function move(siblings: Series[], index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    await reorderTo(siblings, index, targetIndex);
  }

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
        fetch(`/api/admin/series/${id}`, {
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
    if (!confirm(`Delete ${selectedIds.size} series? Videos and files will be detached, not deleted.`))
      return;
    await Promise.all(
      Array.from(selectedIds).map((id) => fetch(`/api/admin/series/${id}`, { method: "DELETE" })),
    );
    setSelectedIds(new Set());
    await load();
  }

  const filteredSeries = useMemo(
    () =>
      query.trim()
        ? series.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
        : series,
    [series, query],
  );
  const groups = groupByCategory(filteredSeries);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Series</h1>

      <form onSubmit={createSeries} className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Series title"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex items-center gap-3">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={memberOnly}
              onChange={(e) => setMemberOnly(e.target.checked)}
            />
            Members only
          </label>
          <button
            type="submit"
            disabled={loading}
            className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Create series
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter series by title…"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

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
          <select
            defaultValue="__placeholder"
            onChange={(e) => {
              if (e.target.value !== "__placeholder") bulkMoveToCategory(e.target.value);
              e.target.value = "__placeholder";
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="__placeholder" disabled>
              Move to category…
            </option>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={bulkDelete} className="rounded-md border border-red-300 px-2 py-1 text-red-600 dark:border-red-900">
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            {group.label}
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {group.items.map((s, index) => (
              <li
                key={s.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 ${draggingId === s.id ? "opacity-40" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromIndex = group.items.findIndex((item) => item.id === draggingId);
                  if (fromIndex !== -1 && fromIndex !== index) reorderTo(group.items, fromIndex, index);
                  setDraggingId(null);
                }}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Select ${s.title}`}
                  />
                  <DragHandle
                    draggable
                    onDragStart={() => setDraggingId(s.id)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                  <div className="min-w-0">
                    <Link href={`/admin/series/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    <p className="text-sm text-zinc-500">
                      {s._count.videos} videos · {s._count.files} files
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PositionInput
                    index={index}
                    total={group.items.length}
                    onReorder={(toIndex) => reorderTo(group.items, index, toIndex)}
                  />
                  <button
                    onClick={() => move(group.items, index, "up")}
                    disabled={index === 0}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(group.items, index, "down")}
                    disabled={index === group.items.length - 1}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <select
                    value={s.categoryId ?? ""}
                    onChange={(e) => reassignCategory(s.id, e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Link
                    href={`/admin/series/${s.id}`}
                    className="rounded-md bg-zinc-900 text-white px-2 py-1 dark:bg-white dark:text-zinc-900"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/series/${s.id}`}
                    className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Manage episodes
                  </Link>
                  <button
                    onClick={() => toggle(s, "published")}
                    className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  >
                    {s.published ? "Published" : "Draft"}
                  </button>
                  <button
                    onClick={() => toggle(s, "memberOnly")}
                    className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  >
                    {s.memberOnly ? "Members only" : "Public"}
                  </button>
                  <button
                    onClick={() => toggle(s, "hidden")}
                    className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${s.hidden ? "border-red-400 text-red-600 dark:text-red-400" : "border-zinc-300"}`}
                  >
                    {s.hidden ? "Hidden" : "Visible"}
                  </button>
                  <button
                    onClick={() => toggle(s, "featured")}
                    className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${s.featured ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
                  >
                    {s.featured ? "Featured" : "Feature"}
                  </button>
                  <button
                    onClick={() => toggle(s, "pinned")}
                    className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${s.pinned ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
                  >
                    {s.pinned ? "Pinned" : "Pin"}
                  </button>
                  <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {filteredSeries.length === 0 && <p className="text-sm text-zinc-500">No series match.</p>}
    </div>
  );
}
