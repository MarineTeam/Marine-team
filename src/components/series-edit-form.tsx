"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DownloadOverrideSelect } from "@/components/download-override-select";

type Category = { id: string; name: string; hymnalStyle: boolean };
type Series = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  abbreviation: string | null;
  hymnPerFile: boolean;
  categoryId: string | null;
  memberOnly: boolean;
  downloadEnabled: boolean | null;
  hidden: boolean;
  published: boolean;
  publishAt: Date | string | null;
  featured: boolean;
  pinned: boolean;
  tags: string[];
  unpublishAt: Date | string | null;
  requireSequential: boolean;
};
type Draft = { data: Record<string, unknown>; updatedAt: string };

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
  initialDraft,
}: {
  series: Series;
  categories: Category[];
  initialDraft: Draft | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [savingDraft, setSavingDraft] = useState(false);
  const [title, setTitle] = useState(series.title);
  const [slug, setSlug] = useState(series.slug);
  const [description, setDescription] = useState(series.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(series.coverImageUrl ?? "");
  const [abbreviation, setAbbreviation] = useState(series.abbreviation ?? "");
  const [hymnPerFile, setHymnPerFile] = useState(series.hymnPerFile);
  const [categoryId, setCategoryId] = useState(series.categoryId ?? "");
  // The hymnal fields below are read only by a hymnalStyle category's book
  // grid, so outside one they save fine and do nothing — which looks like a
  // bug from the admin's side unless it's said out loud.
  const inHymnalCategory = categories.some((c) => c.id === categoryId && c.hymnalStyle);
  const [memberOnly, setMemberOnly] = useState(series.memberOnly);
  const [downloadEnabled, setDownloadEnabled] = useState(series.downloadEnabled);
  const [hidden, setHidden] = useState(series.hidden);
  const [published, setPublished] = useState(series.published);
  const [featured, setFeatured] = useState(series.featured);
  const [pinned, setPinned] = useState(series.pinned);
  const [tags, setTags] = useState(series.tags.join(", "));
  const [publishAt, setPublishAt] = useState(toDatetimeLocal(series.publishAt));
  const [unpublishAt, setUnpublishAt] = useState(toDatetimeLocal(series.unpublishAt));
  const [requireSequential, setRequireSequential] = useState(series.requireSequential);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function buildPayload() {
    return {
      title,
      slug,
      description,
      coverImageUrl,
      abbreviation,
      hymnPerFile,
      categoryId: categoryId || null,
      memberOnly,
      downloadEnabled,
      hidden,
      published,
      featured,
      pinned,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      unpublishAt: unpublishAt ? new Date(unpublishAt).toISOString() : null,
      requireSequential,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/series/${series.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      // Publishing supersedes any staged draft.
      if (draft) {
        await fetch(`/api/admin/series/${series.id}/draft`, { method: "DELETE" });
        setDraft(null);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveAsDraft() {
    setSavingDraft(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/series/${series.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save draft");
      setDraft(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  function loadDraftIntoForm() {
    if (!draft) return;
    const d = draft.data as Partial<ReturnType<typeof buildPayload>> & { tags?: string[] };
    if (d.title !== undefined) setTitle(d.title);
    if (d.slug !== undefined) setSlug(d.slug);
    if (d.description !== undefined) setDescription(d.description ?? "");
    if (d.coverImageUrl !== undefined) setCoverImageUrl(d.coverImageUrl ?? "");
    if (d.abbreviation !== undefined) setAbbreviation(d.abbreviation ?? "");
    if (d.hymnPerFile !== undefined) setHymnPerFile(d.hymnPerFile);
    if (d.categoryId !== undefined) setCategoryId(d.categoryId ?? "");
    if (d.memberOnly !== undefined) setMemberOnly(d.memberOnly);
    if (d.downloadEnabled !== undefined) setDownloadEnabled(d.downloadEnabled);
    if (d.hidden !== undefined) setHidden(d.hidden);
    if (d.published !== undefined) setPublished(d.published);
    if (d.featured !== undefined) setFeatured(d.featured);
    if (d.pinned !== undefined) setPinned(d.pinned);
    if (d.tags !== undefined) setTags(d.tags.join(", "));
    if (d.publishAt !== undefined) setPublishAt(toDatetimeLocal(d.publishAt as string | null));
    if (d.unpublishAt !== undefined) setUnpublishAt(toDatetimeLocal(d.unpublishAt as string | null));
    if (d.requireSequential !== undefined) setRequireSequential(d.requireSequential);
  }

  async function discardDraft() {
    if (!confirm("Discard the saved draft? This can't be undone.")) return;
    await fetch(`/api/admin/series/${series.id}/draft`, { method: "DELETE" });
    setDraft(null);
  }

  async function remove() {
    if (!confirm("Delete this series? Its videos and files will be detached, not deleted.")) {
      return;
    }
    await fetch(`/api/admin/series/${series.id}`, { method: "DELETE" });
    router.push("/admin/series");
  }

  return (
    <div className="space-y-3">
      {draft && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <span>Unpublished draft saved {new Date(draft.updatedAt).toLocaleString()}.</span>
          <button type="button" onClick={loadDraftIntoForm} className="underline">
            Load into form
          </button>
          <button type="button" onClick={discardDraft} className="ml-auto text-red-600 underline">
            Discard draft
          </button>
        </div>
      )}
    <form
      onSubmit={save}
      className="space-y-3 rounded-lg border border-sep p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-sec">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

      <div className="space-y-3 rounded-md border border-sep p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sec">
            Hymnal book
          </span>
          {!inHymnalCategory && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Inactive — these only apply once this series is in a category with &ldquo;Hymnal grid
              style&rdquo; turned on.
            </span>
          )}
        </div>

        <label className="text-sm space-y-1 block">
          <span className="text-sec">
            Abbreviation (badge on this book&apos;s cover, e.g. &quot;GSFH1&quot;)
          </span>
          <input
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value)}
            placeholder="GSFH1"
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-start gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={hymnPerFile}
            onChange={(e) => setHymnPerFile(e.target.checked)}
            className="mt-1"
          />
          <span>
            One hymn per file — this series is a single book and its files are its hymns. Leave off
            when its files are whole book PDFs instead.
          </span>
        </label>
      </div>

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
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-sep px-3 py-2 text-sm"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {/* Flagged so the category that switches on the hymnal layout
                  is findable from here, where that choice is made. */}
              {c.hymnalStyle ? `${c.name} (hymnal grid)` : c.name}
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
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hidden (invisible to everyone but admins/editors)
        </label>
        <DownloadOverrideSelect
          id="series-downloads"
          value={downloadEnabled}
          onChange={setDownloadEnabled}
          inheritedLabel="follows this series' category"
        />
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
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={requireSequential}
            onChange={(e) => setRequireSequential(e.target.checked)}
          />
          Require watching in order
        </label>
        <button
          type="button"
          onClick={saveAsDraft}
          disabled={savingDraft}
          className="sm:ml-auto rounded-md border border-sep px-4 py-2 text-sm disabled:opacity-50"
        >
          {savingDraft ? "Saving draft…" : "Save as draft"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md btn-primary text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? "Publishing…" : "Publish now"}
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
    </div>
  );
}
