"use client";

import { useEffect, useState } from "react";
import { titleFromFilename } from "@/lib/filename";
import { DragHandle, PositionInput, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";
import {
  TargetSelect,
  formatTarget,
  parseTarget,
  type SeriesOption,
  type CategoryOption,
} from "@/components/content-target-picker";
import { BunnyStorageImport } from "@/components/bunny-storage-import";
import { CoverGenerator } from "@/components/cover-generator";
import { FileReplace } from "@/components/file-replace";
import { ContentsEditor } from "@/components/contents-editor";
import { BookHymnLyrics } from "@/components/book-hymn-lyrics";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  useBulkSelect,
} from "@/components/bulk-select";
import { readerFormat } from "@/lib/reader";

type UploadStatus = "pending" | "uploading" | "done" | "failed";

type PendingUpload = {
  key: string;
  file: File;
  title: string;
  status: UploadStatus;
  error: string | null;
};

type FileAsset = {
  id: string;
  title: string;
  url: string;
  memberOnly: boolean;
  hidden: boolean;
  published: boolean;
  unpublishAt: string | null;
  mimeType: string | null;
  podcastPublished: boolean;
  publicPath: string | null;
  bunnyPath: string;
  sizeBytes: number | null;
  coverDataUrl: string | null;
  contentsIndexedAt: string | null;
  pageNumber: number | null;
  groupLabel: string | null;
  lyricsText: string | null;
  pageOffset: number;
  series: { id: string; title: string } | null;
  category: { id: string; name: string } | null;
};

/**
 * Manages downloadable files: upload, publish/visibility toggles, delete.
 * Pass `seriesId` to scope this to one series' handouts, or `categoryId` to
 * scope it to files attached straight to a category (skipping the series
 * layer); omit both for the global "All files" view with a series/category picker.
 */
export function FileManager({ seriesId, categoryId }: { seriesId?: string; categoryId?: string }) {
  const scoped = Boolean(seriesId || categoryId);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [pickedTarget, setPickedTarget] = useState("");
  // One row per picked file. Titles default to the filename (extension
  // stripped) and stay editable until the moment each row is uploaded.
  const [queue, setQueue] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Book and hymn fields (page offset; printed page number, "Category" tab
  // grouping, lyrics) are edited in a per-row panel rather than as more
  // buttons in the row above: they're free text, and each only applies to
  // one shape of book — the offset to a whole-book PDF, the other three to
  // a file that is one hymn inside a hymnPerFile series.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPageOffset, setEditPageOffset] = useState("");
  const [editPageNumber, setEditPageNumber] = useState("");
  const [editGroupLabel, setEditGroupLabel] = useState("");
  const [editLyricsText, setEditLyricsText] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  async function load() {
    const [filesRes, seriesRes, categoriesRes] = await Promise.all([
      fetch("/api/admin/files"),
      fetch("/api/admin/series"),
      fetch("/api/admin/categories"),
    ]);
    if (filesRes.ok) setFiles(await filesRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
    if (categoriesRes.ok) setCategoryList(await categoriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function addToQueue(picked: FileList | null) {
    if (!picked?.length) return;
    setQueue((current) => [
      ...current,
      ...Array.from(picked).map((file) => ({
        // Stable across re-renders and unique per row, so editing one title
        // can't be attributed to a different row after a removal.
        key: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        title: titleFromFilename(file.name),
        status: "pending" as UploadStatus,
        error: null as string | null,
      })),
    ]);
  }

  /**
   * Uploads the queue one file per request, rather than batching them into a
   * single one. The server cap is per *request*, so batching would make the
   * size limit worse rather than better — and one file at a time means a
   * rejected file reports against its own row instead of failing the rest.
   */
  async function uploadQueue(e: React.FormEvent) {
    e.preventDefault();
    const target = scoped
      ? { seriesId: seriesId ?? null, categoryId: categoryId ?? null }
      : parseTarget(pickedTarget);

    setUploading(true);
    let anySucceeded = false;
    try {
      for (const item of queue) {
        if (item.status === "done") continue;
        setQueue((current) =>
          current.map((row) => (row.key === item.key ? { ...row, status: "uploading", error: null } : row)),
        );
        try {
          const form = new FormData();
          form.append("file", item.file);
          form.append("title", item.title.trim() || titleFromFilename(item.file.name));
          if (target.seriesId) form.append("seriesId", target.seriesId);
          if (target.categoryId) form.append("categoryId", target.categoryId);
          const res = await fetch("/api/admin/files", { method: "POST", body: form });
          if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
          anySucceeded = true;
          setQueue((current) =>
            current.map((row) => (row.key === item.key ? { ...row, status: "done" } : row)),
          );
        } catch (err) {
          setQueue((current) =>
            current.map((row) =>
              row.key === item.key
                ? { ...row, status: "failed", error: err instanceof Error ? err.message : "Upload failed" }
                : row,
            ),
          );
        }
      }
      // Successful rows are cleared; failures stay put with their reason, so
      // a partly-failed batch can be retried without re-picking everything.
      setQueue((current) => current.filter((row) => row.status !== "done"));
      if (anySucceeded) {
        setPickedTarget("");
        await load();
      }
    } finally {
      setUploading(false);
    }
  }

  async function setExpiry(f: FileAsset) {
    const input = prompt(
      "Unpublish this file at (YYYY-MM-DDTHH:MM, local time)? Leave blank to clear.",
      "",
    );
    if (input === null) return;
    const unpublishAt = input.trim() ? new Date(input.trim()).toISOString() : null;
    await fetch(`/api/admin/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unpublishAt }),
    });
    await load();
  }

  async function toggle(f: FileAsset, field: "published" | "memberOnly" | "hidden" | "podcastPublished") {
    await fetch(`/api/admin/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !f[field] }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Move this file to Trash? It's restorable from Admin > Trash; the Bunny Storage object isn't removed until it's permanently deleted from there.")) return;
    await fetch(`/api/admin/files/${id}`, { method: "DELETE" });
    await load();
  }

  function startEditingDetails(f: FileAsset) {
    setEditingId(f.id);
    setEditTitle(f.title);
    // Blank rather than "0" for a book nobody has set an offset on: an empty
    // box reads as "not needed", which is the truth for most books.
    setEditPageOffset(f.pageOffset ? String(f.pageOffset) : "");
    setEditPageNumber(f.pageNumber != null ? String(f.pageNumber) : "");
    setEditGroupLabel(f.groupLabel ?? "");
    setEditLyricsText(f.lyricsText ?? "");
  }

  async function saveDetails(id: string) {
    setSavingDetails(true);
    try {
      const trimmedPage = editPageNumber.trim();
      await fetch(`/api/admin/files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Omitted rather than sent blank: the API requires a non-empty
          // title, and clearing the box shouldn't fail the whole save.
          ...(editTitle.trim() ? { title: editTitle.trim() } : {}),
          // Cleared back to 0 rather than omitted: the column isn't
          // nullable, and emptying the box is how an offset is removed.
          pageOffset: Number(editPageOffset.trim()) || 0,
          pageNumber: trimmedPage ? Number(trimmedPage) : null,
          groupLabel: editGroupLabel.trim() || null,
          lyricsText: editLyricsText.trim() || null,
        }),
      });
      setEditingId(null);
      await load();
    } finally {
      setSavingDetails(false);
    }
  }

  async function reassignTarget(id: string, target: string) {
    const parsed = parseTarget(target);
    await fetch(`/api/admin/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: parsed.seriesId, categoryId: parsed.categoryId }),
    });
    await load();
  }

  const scopedFiles = seriesId
    ? files.filter((f) => f.series?.id === seriesId)
    : categoryId
      ? files.filter((f) => f.category?.id === categoryId)
      : files;
  const visibleFiles =
    !scoped && query.trim()
      ? scopedFiles.filter((f) => f.title.toLowerCase().includes(query.trim().toLowerCase()))
      : scopedFiles;

  // Scoped to what's on screen, so a filtered-out file can't be caught by
  // "select all" or a shift-range it isn't visibly part of.
  const bulk = useBulkSelect(visibleFiles.map((f) => f.id));

  /** One request for the whole selection — see /api/admin/files/bulk. */
  async function bulkAction(body: Record<string, unknown>) {
    setBulkBusy(true);
    await fetch("/api/admin/files/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: bulk.selected, ...body }),
    });
    bulk.clear();
    setBulkBusy(false);
    await load();
  }

  async function bulkSchedule() {
    const input = prompt(`Publish ${bulk.count} file(s) at (YYYY-MM-DDTHH:MM, local time)?`, "");
    if (!input?.trim()) return;
    await bulkAction({ action: "schedule", publishAt: new Date(input.trim()).toISOString() });
  }

  async function bulkDelete() {
    if (!confirm(`Move ${bulk.count} file(s) to Trash? Restorable from Admin > Trash.`)) return;
    await bulkAction({ action: "delete" });
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(visibleFiles, fromIndex, toIndex);
    await Promise.all(
      reordered.map((f, i) =>
        fetch(`/api/admin/files/${f.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  async function move(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visibleFiles.length) return;
    await reorderTo(index, targetIndex);
  }

  const { draggingIndex, handleProps, dropZoneProps } = useDragReorder(reorderTo);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">
        {seriesId ? "Files" : categoryId ? "Files in category" : "All files"}
      </h2>

      <form
        onSubmit={uploadQueue}
        className="space-y-3 rounded-lg border border-sep p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          {!scoped && (
            <TargetSelect value={pickedTarget} onChange={setPickedTarget} seriesList={seriesList} categoryList={categoryList} />
          )}
          <input
            type="file"
            multiple
            onChange={(e) => {
              addToQueue(e.target.files);
              // Cleared so picking the same file again after removing it
              // still fires a change event.
              e.target.value = "";
            }}
            className="text-sm max-w-full"
          />
          <button
            type="submit"
            disabled={uploading || queue.length === 0}
            className="sm:ml-auto rounded-md btn-primary text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {uploading
              ? "Uploading…"
              : queue.length > 1
                ? `Upload ${queue.length} files`
                : "Upload"}
          </button>
        </div>

        {queue.length > 0 && (
          <ul className="space-y-2">
            {queue.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2">
                <input
                  value={item.title}
                  onChange={(e) =>
                    setQueue((current) =>
                      current.map((row) => (row.key === item.key ? { ...row, title: e.target.value } : row)),
                    )
                  }
                  aria-label={`Title for ${item.file.name}`}
                  placeholder={titleFromFilename(item.file.name)}
                  disabled={uploading}
                  className="min-w-0 flex-1 rounded-md border border-sep px-3 py-2 text-sm disabled:opacity-60"
                />
                <span className="w-28 shrink-0 truncate text-xs text-sec" title={item.file.name}>
                  {item.file.name}
                </span>
                {item.status === "uploading" && <span className="text-xs text-sec">Uploading…</span>}
                {item.status === "failed" && (
                  <span className="text-xs text-red-600" title={item.error ?? undefined}>
                    Failed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setQueue((current) => current.filter((row) => row.key !== item.key))}
                  disabled={uploading}
                  aria-label={`Remove ${item.file.name}`}
                  className="shrink-0 px-1 text-xs text-ter hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {queue.some((row) => row.status === "failed") && (
          <ul className="space-y-1 text-xs text-red-600">
            {queue
              .filter((row) => row.status === "failed")
              .map((row) => (
                <li key={`${row.key}-error`}>
                  {row.file.name}: {row.error}
                </li>
              ))}
          </ul>
        )}

        <p className="text-xs text-sec">
          Titles default to each file&apos;s name and can be edited before uploading. Max 4MB per file
          (server upload limit) — files upload one at a time, so one rejection doesn&apos;t stop the
          rest. For anything larger, upload it straight to Bunny Storage and add it below.
        </p>
      </form>

      <BunnyStorageImport
        seriesId={seriesId}
        categoryId={categoryId}
        seriesList={seriesList}
        categoryList={categoryList}
        onImported={load}
      />

      {/* PDFs only — a cover is that PDF's own first page, so there's
          nothing to draw for audio or anything else here. */}
      <CoverGenerator
        files={visibleFiles.filter((f) => readerFormat(f.mimeType, f.bunnyPath) === "pdf")}
        onGenerated={load}
      />

      {!scoped && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files by title…"
          className="w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
      )}

      {visibleFiles.length > 0 && (
        <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={bulkBusy} />
      )}

      <BulkBar count={bulk.count} onClear={bulk.clear} busy={bulkBusy}>
        <BulkButton onClick={() => bulkAction({ action: "publish" })}>Publish</BulkButton>
        <BulkButton onClick={() => bulkAction({ action: "unpublish" })}>Unpublish</BulkButton>
        <BulkButton onClick={bulkSchedule}>Schedule publish…</BulkButton>
        <BulkButton danger onClick={bulkDelete}>
          Delete
        </BulkButton>
      </BulkBar>

      <ul className="divide-y divide-sep rounded-lg border border-sep">
        {visibleFiles.map((f, index) => (
          <li
            key={f.id}
            className={`p-4 flex flex-wrap flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 ${draggingIndex === index ? "opacity-40" : ""}`}
            {...(scoped ? dropZoneProps(index) : {})}
          >
            <div className="min-w-0 flex items-center gap-2">
              <BulkCheckbox
                checked={bulk.isSelected(f.id)}
                onToggle={(shift) => bulk.toggle(f.id, shift)}
                label={f.title}
              />
              {scoped && <DragHandle {...handleProps(index)} />}
              <div className="min-w-0">
                <p className="font-medium">{f.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {scoped && (
                <>
                  <PositionInput
                    index={index}
                    total={visibleFiles.length}
                    onReorder={(toIndex) => reorderTo(index, toIndex)}
                  />
                  <button
                    onClick={() => move(index, "up")}
                    disabled={index === 0}
                    className="rounded-md border border-sep px-2 py-1 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, "down")}
                    disabled={index === visibleFiles.length - 1}
                    className="rounded-md border border-sep px-2 py-1 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </>
              )}
              {!scoped && (
                <TargetSelect
                  value={formatTarget(f.series?.id ?? null, f.category?.id ?? null)}
                  onChange={(value) => reassignTarget(f.id, value)}
                  seriesList={seriesList}
                  categoryList={categoryList}
                />
              )}
              <button
                onClick={() => toggle(f, "published")}
                className="rounded-md border border-sep px-2 py-1"
              >
                {f.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => setExpiry(f)}
                className={`rounded-md border px-2 py-1 ${f.unpublishAt ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-sep"}`}
                title={f.unpublishAt ? `Unpublishes ${new Date(f.unpublishAt).toLocaleString()}` : undefined}
              >
                {f.unpublishAt ? "Expires" : "Set expiry"}
              </button>
              <button
                onClick={() => toggle(f, "memberOnly")}
                className="rounded-md border border-sep px-2 py-1"
              >
                {f.memberOnly ? "Members only" : "Public"}
              </button>
              {/* Audio only: this publishes the file to a permanently public
                  URL for podcast apps, which makes no sense for a handout.
                  The label reports the mirror's real state, not just the
                  intent — "Pending" means the copy hasn't landed yet, or
                  something (members-only, unpublished, a members-only
                  series) currently disqualifies it. */}
              {f.mimeType?.startsWith("audio/") && (
                <button
                  onClick={() => toggle(f, "podcastPublished")}
                  className={`rounded-md border px-2 py-1 ${f.podcastPublished ? "border-accent text-accent" : "border-sep"}`}
                  title="Publish this episode to the public podcast feed. It is copied to a separate public storage zone and becomes readable without a login."
                >
                  {f.podcastPublished ? (f.publicPath ? "In podcast" : "Podcast pending") : "Not in podcast"}
                </button>
              )}
              <button
                onClick={() => toggle(f, "hidden")}
                className={`rounded-md border px-2 py-1 ${f.hidden ? "border-red-400 text-red-600 dark:text-red-400" : "border-sep"}`}
              >
                {f.hidden ? "Hidden" : "Visible"}
              </button>
              <button
                onClick={() => (editingId === f.id ? setEditingId(null) : startEditingDetails(f))}
                className={`rounded-md border px-2 py-1 ${f.pageOffset !== 0 || f.pageNumber != null || f.groupLabel || f.lyricsText ? "border-accent text-accent" : "border-sep"}`}
                title="Rename this file. Page offset applies to a whole-book PDF; page number, category grouping and lyrics apply when it's one hymn in a 'one hymn per file' series."
              >
                {editingId === f.id ? "Close" : "Details"}
              </button>
              <button onClick={() => remove(f.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
            {editingId === f.id && (
              <div className="w-full space-y-2 rounded-md border border-sep bg-chip p-3">
                <label className="block space-y-1 text-xs">
                  <span className="text-sec">Title</span>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                  />
                </label>
                {/* A whole-book setting, so it sits above the per-hymn
                    fields and only appears on a PDF — nothing else in this
                    list has pages to offset. */}
                {readerFormat(f.mimeType, f.bunnyPath) === "pdf" && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-sec">
                      Page offset — pages of front matter before printed page 1. A book with a title
                      page and a 10-page contents section: 10. Leave blank when the book starts on
                      its first page.
                    </span>
                    <input
                      type="number"
                      value={editPageOffset}
                      onChange={(e) => setEditPageOffset(e.target.value)}
                      className="w-full rounded-md border border-sep px-2 py-1.5 text-sm sm:w-40"
                    />
                  </label>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-sec">Page number (printed page in the book)</span>
                    <input
                      type="number"
                      value={editPageNumber}
                      onChange={(e) => setEditPageNumber(e.target.value)}
                      className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-sec">Category grouping (e.g. &quot;Praise&quot;, &quot;Prayer&quot;)</span>
                    <input
                      value={editGroupLabel}
                      onChange={(e) => setEditGroupLabel(e.target.value)}
                      className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-xs">
                  <span className="text-sec">
                    Lyrics (shown on the hymn&apos;s page; leave blank to show the PDF instead)
                  </span>
                  <textarea
                    value={editLyricsText}
                    onChange={(e) => setEditLyricsText(e.target.value)}
                    rows={6}
                    className="w-full rounded-md border border-sep px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                <button
                  onClick={() => saveDetails(f.id)}
                  disabled={savingDetails}
                  className="rounded-md btn-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {savingDetails ? "Saving…" : "Save details"}
                </button>

                {/* Its own thing with its own save, below the row's fields:
                    a book's contents are hundreds of entries, and typing
                    them is a sitting rather than an edit. PDFs only —
                    an EPUB carries its own navigation document. */}
                {readerFormat(f.mimeType, f.bunnyPath) === "pdf" && (
                  <>
                    <ContentsEditor file={f} onSaved={load} />
                    {/* Below the contents, because it is keyed to them: the
                        words go against a hymn number, and the numbers come
                        from the index above. */}
                    <BookHymnLyrics file={f} />
                  </>
                )}

                {/*
                  Last in the panel, behind everything else about the file:
                  it is the one action here that changes what people are
                  actually reading.
                */}
                <FileReplace file={f} onReplaced={load} />
              </div>
            )}
          </li>
        ))}
        {visibleFiles.length === 0 && (
          <li className="p-4 text-sm text-sec">
            {seriesId ? "No files in this series yet." : categoryId ? "No files in this category yet." : "No files yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
