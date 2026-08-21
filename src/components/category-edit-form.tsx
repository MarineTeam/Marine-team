"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DownloadOverrideSelect } from "@/components/download-override-select";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  tags: string[];
  memberOnly: boolean;
  downloadEnabled: boolean | null;
  hidden: boolean;
  published: boolean;
  publishAt: Date | string | null;
  unpublishAt: Date | string | null;
  featured: boolean;
  requireSequential: boolean;
  hymnalStyle: boolean;
};

/** Converts a Date/ISO string to the value a <input type="datetime-local"> expects (local time, no seconds). */
function toDatetimeLocal(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CategoryEditForm({ category }: { category: Category }) {
  const router = useRouter();
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [description, setDescription] = useState(category.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(category.coverImageUrl ?? "");
  const [tags, setTags] = useState(category.tags.join(", "));
  const [memberOnly, setMemberOnly] = useState(category.memberOnly);
  const [downloadEnabled, setDownloadEnabled] = useState(category.downloadEnabled);
  const [hidden, setHidden] = useState(category.hidden);
  const [published, setPublished] = useState(category.published);
  const [featured, setFeatured] = useState(category.featured);
  const [publishAt, setPublishAt] = useState(toDatetimeLocal(category.publishAt));
  const [unpublishAt, setUnpublishAt] = useState(toDatetimeLocal(category.unpublishAt));
  const [requireSequential, setRequireSequential] = useState(category.requireSequential);
  const [hymnalStyle, setHymnalStyle] = useState(category.hymnalStyle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          coverImageUrl,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          memberOnly,
          downloadEnabled,
          hidden,
          published,
          featured,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          unpublishAt: unpublishAt ? new Date(unpublishAt).toISOString() : null,
          requireSequential,
          hymnalStyle,
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

  return (
    <form
      onSubmit={save}
      className="space-y-3 rounded-lg border border-sep p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-sec">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-sec">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="text-sm space-y-1 block">
        <span className="text-sec">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
      </label>

      <label className="text-sm space-y-1 block">
        <span className="text-sec">Cover image URL</span>
        <input
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
      </label>

      <label className="text-sm space-y-1 block">
        <span className="text-sec">Tags (comma-separated)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="worship, easter, youth"
          className="w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1 block">
          <span className="text-sec">Publish at (leave blank to publish immediately)</span>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm space-y-1 block">
          <span className="text-sec">Unpublish at (leave blank to never expire)</span>
          <input
            type="datetime-local"
            value={unpublishAt}
            onChange={(e) => setUnpublishAt(e.target.value)}
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hidden (invisible to everyone but admins/editors)
        </label>
        <DownloadOverrideSelect
          id="category-downloads"
          value={downloadEnabled}
          onChange={setDownloadEnabled}
          inheritedLabel="follows the parent category, or the site default"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
          Featured
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={requireSequential}
            onChange={(e) => setRequireSequential(e.target.checked)}
          />
          Require watching in order (applies to this category&apos;s own direct videos)
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={hymnalStyle}
            onChange={(e) => setHymnalStyle(e.target.checked)}
          />
          Hymnal grid style (series shown as a cover grid; hymns browsable by Page/A-Z/Category)
        </label>
        <button
          type="submit"
          disabled={saving}
          className="sm:ml-auto rounded-md btn-primary text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {saved && <p className="text-sm text-green-600">Saved.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
