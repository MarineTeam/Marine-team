"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = { id: string; name: string };
type Series = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  categoryId: string | null;
  memberOnly: boolean;
  published: boolean;
  publishAt: Date | string | null;
  featured: boolean;
  pinned: boolean;
  tags: string[];
  unpublishAt: Date | string | null;
};

/** Converts a Date/ISO string to the value a <input type="datetime-local"> expects (local time, no seconds). */
function toDatetimeLocal(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SeriesEditForm({
  series,
  categories,
}: {
  series: Series;
  categories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(series.title);
  const [slug, setSlug] = useState(series.slug);
  const [description, setDescription] = useState(series.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(series.coverImageUrl ?? "");
  const [categoryId, setCategoryId] = useState(series.categoryId ?? "");
  const [memberOnly, setMemberOnly] = useState(series.memberOnly);
  const [published, setPublished] = useState(series.published);
  const [featured, setFeatured] = useState(series.featured);
  const [pinned, setPinned] = useState(series.pinned);
  const [tags, setTags] = useState(series.tags.join(", "));
  const [publishAt, setPublishAt] = useState(toDatetimeLocal(series.publishAt));
  const [unpublishAt, setUnpublishAt] = useState(toDatetimeLocal(series.unpublishAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/series/${series.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          description,
          coverImageUrl,
          categoryId: categoryId || null,
          memberOnly,
          published,
          featured,
          pinned,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          unpublishAt: unpublishAt ? new Date(unpublishAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this series? Its videos and files will be detached, not deleted.")) {
      return;
    }
    await fetch(`/api/admin/series/${series.id}`, { method: "DELETE" });
    router.push("/admin/series");
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-zinc-500">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            required
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-zinc-500">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            required
          />
        </label>
      </div>

      <label className="text-sm space-y-1 block">
        <span className="text-zinc-500">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="text-sm space-y-1 block">
        <span className="text-zinc-500">Cover image URL</span>
        <input
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="text-sm space-y-1 block">
        <span className="text-zinc-500">Tags (comma-separated)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="worship, easter, youth"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1 block">
          <span className="text-zinc-500">Publish at (leave blank to publish immediately)</span>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-sm space-y-1 block">
          <span className="text-zinc-500">Unpublish at (leave blank to never expire)</span>
          <input
            type="datetime-local"
            value={unpublishAt}
            onChange={(e) => setUnpublishAt(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={memberOnly}
            onChange={(e) => setMemberOnly(e.target.checked)}
          />
          Members only
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
          Featured (homepage hero)
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pinned (shown first)
        </label>
        <button
          type="submit"
          disabled={saving}
          className="sm:ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-red-300 text-red-600 px-3 py-2 text-sm hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          Delete series
        </button>
      </div>
      {saved && <p className="text-sm text-green-600">Saved.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
