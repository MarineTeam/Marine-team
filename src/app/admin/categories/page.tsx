"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DragHandle, PositionInput } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  bulkFetch,
  runBulk,
  useBulkSelect,
} from "@/components/bulk-select";

type Category = {
  id: string;
  name: string;
  slug: string;
  position: number;
  pinned: boolean;
  published: boolean;
  memberOnly: boolean;
  hidden: boolean;
  featured: boolean;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Every category, at any nesting depth — the tree is rendered recursively
  // but selection is flat, so "select all" means every row on screen.
  const bulk = useBulkSelect(categories.map((c) => c.id));

  async function bulkPatch(body: Record<string, unknown>) {
    setBusy(true);
    await runBulk(bulk.selected, (id) =>
      bulkFetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    bulk.clear();
    setBusy(false);
    await load();
  }

  async function bulkDelete() {
    if (
      !confirm(
        `Move ${bulk.count} categor${bulk.count === 1 ? "y" : "ies"} to Trash? Restorable from Admin > Trash.`,
      )
    )
      return;
    setBusy(true);
    await runBulk(bulk.selected, (id) =>
      bulkFetch(`/api/admin/categories/${id}`, { method: "DELETE" }),
    );
    bulk.clear();
    setBusy(false);
    await load();
  }

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

  async function reorderTo(siblings: CategoryNode[], fromIndex: number, toIndex: number) {
    const reordered = reorderArray(siblings, fromIndex, toIndex);
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

  async function move(siblings: CategoryNode[], index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    await reorderTo(siblings, index, targetIndex);
  }

  async function togglePinned(category: Category) {
    await fetch(`/api/admin/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !category.pinned }),
    });
    await load();
  }

  async function toggle(category: Category, field: "published" | "memberOnly" | "hidden" | "featured") {
    await fetch(`/api/admin/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !category[field] }),
    });
    await load();
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Move this category to Trash? Series/sub-categories inside it aren't deleted, but disappear from the site until you restore it from Admin > Trash.",
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
        className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 ${draggingId === node.id ? "opacity-40" : ""}`}
        style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const fromIndex = nodes.findIndex((n) => n.id === draggingId);
          if (fromIndex !== -1 && fromIndex !== index) reorderTo(nodes, fromIndex, index);
          setDraggingId(null);
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <BulkCheckbox
            checked={bulk.isSelected(node.id)}
            onChange={() => bulk.toggle(node.id)}
            label={node.name}
          />
          <DragHandle
            draggable
            onDragStart={() => setDraggingId(node.id)}
            onDragEnd={() => setDraggingId(null)}
          />
          <div className="min-w-0">
            <Link href={`/admin/categories/${node.id}`} className="font-medium hover:underline">
              {node.name}
            </Link>
            <p className="text-sm text-zinc-500">
              {node.slug}
              {node.parent && ` · under ${node.parent.name}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PositionInput
            index={index}
            total={nodes.length}
            onReorder={(toIndex) => reorderTo(nodes, index, toIndex)}
          />
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
          <Link
            href={`/admin/categories/${node.id}`}
            className="rounded-md bg-zinc-900 text-white px-2 py-1 dark:bg-white dark:text-zinc-900"
          >
            Edit
          </Link>
          <button
            onClick={() => toggle(node, "published")}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            {node.published ? "Published" : "Draft"}
          </button>
          <button
            onClick={() => toggle(node, "memberOnly")}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            {node.memberOnly ? "Members only" : "Public"}
          </button>
          <button
            onClick={() => toggle(node, "hidden")}
            className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${node.hidden ? "border-red-400 text-red-600 dark:text-red-400" : "border-zinc-300"}`}
          >
            {node.hidden ? "Hidden" : "Visible"}
          </button>
          <button
            onClick={() => toggle(node, "featured")}
            className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${node.featured ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
          >
            {node.featured ? "Featured" : "Feature"}
          </button>
          <button
            onClick={() => togglePinned(node)}
            className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${node.pinned ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
          >
            {node.pinned ? "Pinned" : "Pin"}
          </button>
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

      {categories.length > 0 && (
        <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={busy} />
      )}

      <BulkBar count={bulk.count} onClear={bulk.clear} busy={busy}>
        <BulkButton onClick={() => bulkPatch({ published: true })}>Publish</BulkButton>
        <BulkButton onClick={() => bulkPatch({ published: false })}>Unpublish</BulkButton>
        <BulkButton onClick={() => bulkPatch({ hidden: true })}>Hide</BulkButton>
        <BulkButton onClick={() => bulkPatch({ hidden: false })}>Show</BulkButton>
        <BulkButton onClick={() => bulkPatch({ memberOnly: true })}>Members only</BulkButton>
        <BulkButton onClick={() => bulkPatch({ memberOnly: false })}>Public</BulkButton>
        <BulkButton danger onClick={bulkDelete}>
          Delete
        </BulkButton>
      </BulkBar>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {renderNodes(tree, 0)}
        {categories.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No categories yet.</li>
        )}
      </ul>
    </div>
  );
}
