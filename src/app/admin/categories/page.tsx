"use client";

import { useEffect, useState } from "react";

type Category = {
  id: string;
  name: string;
  slug: string;
  position: number;
  parentId: string | null;
  parent: { id: string; name: string } | null;
};

type CategoryNode = Category & { children: CategoryNode[] };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  categories.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/** A category's own id plus every id nested beneath it, so the parent picker can't create a cycle. */
function descendantIds(category: Category, all: Category[]): Set<string> {
  const ids = new Set([category.id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/categories");
    if (res.ok) setCategories(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slugify(name),
          parentId: parentId || null,
          position: categories.length,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      setName("");
      setParentId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  async function changeParent(category: Category, newParentId: string) {
    setError(null);
    const res = await fetch(`/api/admin/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: newParentId || null }),
    });
    if (!res.ok) setError((await res.json()).error ?? "Failed to update");
    await load();
  }

  async function move(siblings: CategoryNode[], index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    await Promise.all(
      reordered.map((node, i) =>
        fetch(`/api/admin/categories/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Delete this category? Series in it will become uncategorized, and any sub-categories will become top-level.",
      )
    )
      return;
    await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    await load();
  }

  function renderNodes(nodes: CategoryNode[], depth: number): React.ReactNode[] {
    return nodes.flatMap((node, index) => [
      <li
        key={node.id}
        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
        style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
      >
        <div className="min-w-0">
          <p className="font-medium">{node.name}</p>
          <p className="text-sm text-zinc-500">
            {node.slug}
            {node.parent && ` · under ${node.parent.name}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => move(nodes, index, "up")}
            disabled={index === 0}
            className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => move(nodes, index, "down")}
            disabled={index === nodes.length - 1}
            className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
            aria-label="Move down"
          >
            ↓
          </button>
          <select
            value={node.parentId ?? ""}
            onChange={(e) => changeParent(node, e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No parent (top-level)</option>
            {categories
              .filter((c) => !descendantIds(node, categories).has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button onClick={() => remove(node.id)} className="text-red-600 hover:underline">
            Delete
          </button>
        </div>
      </li>,
      ...renderNodes(node.children, depth + 1),
    ]);
  }

  const tree = buildTree(categories);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Categories</h1>

      <form onSubmit={createCategory} className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">No parent (top-level)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {renderNodes(tree, 0)}
        {categories.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No categories yet.</li>
        )}
      </ul>
    </div>
  );
}
