"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminTarget } from "@/lib/use-admin-target";

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
};

export function SeriesEditForm({
  series,
  categories,
}: {
  series: Series;
  categories: Category[];
}) {
  const router = useRouter();
  const { apiPath, isDemo } = useAdminTarget();
  const [title, setTitle] = useState(series.title);
  const [slug, setSlug] = useState(series.slug);
  const [description, setDescription] = useState(series.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(series.coverImageUrl ?? "");
  const [categoryId, setCategoryId] = useState(series.categoryId ?? "");
  const [memberOnly, setMemberOnly] = useState(series.memberOnly);
  const [published, setPublished] = useState(series.published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(apiPath(`/api/admin/series/${series.id}`), {
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
    await fetch(apiPath(`/api/admin/series/${series.id}`), { method: "DELETE" });
    router.push(isDemo ? "/admin/demo/series" : "/admin/series");
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
        <button
          type="submit"
          disabled={saving}
          className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
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
