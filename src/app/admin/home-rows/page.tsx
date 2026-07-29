"use client";

import { useEffect, useState } from "react";
import { DragHandle, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";

type HomeRowType = "CONTINUE_WATCHING" | "RECOMMENDATIONS" | "TRENDING" | "RECENTLY_ADDED" | "CATEGORY" | "TAG";
type HomeRow = {
  id: string;
  type: HomeRowType;
  title: string | null;
  enabled: boolean;
  position: number;
  category: { id: string; name: string } | null;
  tag: string | null;
};
type CategoryOption = { id: string; name: string };

const DEFAULT_LABEL: Record<HomeRowType, string> = {
  CONTINUE_WATCHING: "Continue watching",
  RECOMMENDATIONS: "Because you watched…",
  TRENDING: "Trending this week",
  RECENTLY_ADDED: "Recently added",
  CATEGORY: "Category row",
  TAG: "Tag row",
};

export default function HomeRowsAdminPage() {
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [newType, setNewType] = useState<"CATEGORY" | "TAG">("CATEGORY");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [rowsRes, categoriesRes] = await Promise.all([
      fetch("/api/admin/home-rows"),
      fetch("/api/admin/categories"),
    ]);
    if (rowsRes.ok) setRows(await rowsRes.json());
    if (categoriesRes.ok) setCategories(await categoriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function toggleEnabled(row: HomeRow) {
    await fetch(`/api/admin/home-rows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  async function saveTitle(row: HomeRow, title: string) {
    await fetch(`/api/admin/home-rows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || null }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this row from the homepage?")) return;
    await fetch(`/api/admin/home-rows/${id}`, { method: "DELETE" });
    await load();
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(rows, fromIndex, toIndex);
    setRows(reordered);
    await Promise.all(
      reordered.map((r, i) =>
        fetch(`/api/admin/home-rows/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/home-rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          title: newTitle.trim() || undefined,
          categoryId: newType === "CATEGORY" ? newCategoryId : undefined,
          tag: newType === "TAG" ? newTag.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add row");
      setNewCategoryId("");
      setNewTag("");
      setNewTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add row");
    }
  }

  const { draggingIndex, handleProps, dropZoneProps } = useDragReorder(reorderTo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Homepage</h1>
        <p className="text-sm text-zinc-500">
          Turn rows on/off, rename them, and add curated rows pointing at a category or tag. The category/series
          browse list always shows and can&apos;t be reordered; Continue Watching (when shown) always renders just
          above it. Everything else here reorders and appears below the browse list, in the order shown.
        </p>
      </div>

      <form onSubmit={create} className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "CATEGORY" | "TAG")}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="CATEGORY">Category row</option>
            <option value="TAG">Tag row</option>
          </select>
          {newType === "CATEGORY" ? (
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Tag"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          )}
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Row title (optional)"
            className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Add row
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className={`p-4 flex flex-wrap items-center gap-3 ${draggingIndex === index ? "opacity-40" : ""}`}
            {...dropZoneProps(index)}
          >
            <DragHandle {...handleProps(index)} />
            <div className="min-w-0 flex-1">
              <input
                defaultValue={row.title ?? ""}
                placeholder={DEFAULT_LABEL[row.type]}
                onBlur={(e) => saveTitle(row, e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {row.type === "CATEGORY"
                  ? `Category: ${row.category?.name ?? "(deleted)"}`
                  : row.type === "TAG"
                    ? `Tag: ${row.tag}`
                    : "Built-in"}
              </p>
            </div>
            <button
              onClick={() => toggleEnabled(row)}
              className={`rounded-md border px-2 py-1 text-sm dark:border-zinc-700 ${row.enabled ? "" : "border-amber-400 text-amber-700 dark:text-amber-400"}`}
            >
              {row.enabled ? "Shown" : "Hidden"}
            </button>
            {(row.type === "CATEGORY" || row.type === "TAG") && (
              <button onClick={() => remove(row.id)} className="text-sm text-red-600 hover:underline">
                Remove
              </button>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="p-4 text-sm text-zinc-500">Loading…</li>}
      </ul>
    </div>
  );
}
