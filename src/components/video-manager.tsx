"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Upload } from "tus-js-client";
import { DragHandle, PositionInput, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";
import { ViewerAccessManager } from "@/components/viewer-access-manager";
import { ThumbnailManager } from "@/components/thumbnail-manager";
import { ChapterManager } from "@/components/chapter-manager";
import {
  TargetSelect,
  formatTarget,
  parseTarget,
  type SeriesOption,
  type CategoryOption,
} from "@/components/content-target-picker";

type Video = {
  id: string;
  title: string;
  slug: string;
  status: "PROCESSING" | "READY" | "FAILED";
  memberOnly: boolean;
  hidden: boolean;
  published: boolean;
  unpublishAt: string | null;
  publishAt: string | null;
  isPremiere: boolean;
  series: { id: string; title: string } | null;
  category: { id: string; name: string } | null;
  thumbnailPreviewUrl: string;
};
type BunnyLibraryVideo = {
  guid: string;
  title: string;
  status: number;
  length: number;
  dateUploaded: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Manages videos: upload, import from an existing Bunny Stream library,
 * publish/visibility toggles, and delete. Pass `seriesId` to scope this to
 * one series' episodes, or `categoryId` to scope it to videos attached
 * straight to a category (skipping the series layer); omit both for the
 * global "All videos" view, which shows every video with a series/category picker.
 */
export function VideoManager({ seriesId, categoryId }: { seriesId?: string; categoryId?: string }) {
  const scoped = Boolean(seriesId || categoryId);
  const [videos, setVideos] = useState<Video[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [title, setTitle] = useState("");
  const [pickedTarget, setPickedTarget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [bunnyLibrary, setBunnyLibrary] = useState<BunnyLibraryVideo[] | null>(null);
  const [bunnyLoading, setBunnyLoading] = useState(false);
  const [importDrafts, setImportDrafts] = useState<
    Record<string, { title: string; slug: string; target: string }>
  >({});
  const [importingGuid, setImportingGuid] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [managingAccessId, setManagingAccessId] = useState<string | null>(null);
  const [managingThumbnailId, setManagingThumbnailId] = useState<string | null>(null);
  const [managingChaptersId, setManagingChaptersId] = useState<string | null>(null);

  async function load() {
    const [videosRes, seriesRes, categoriesRes] = await Promise.all([
      fetch("/api/admin/videos"),
      fetch("/api/admin/series"),
      fetch("/api/admin/categories"),
    ]);
    if (videosRes.ok) setVideos(await videosRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
    if (categoriesRes.ok) setCategoryList(await categoriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function loadBunnyLibrary() {
    setBunnyLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/videos/bunny-library");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to list Bunny videos");
      const items: BunnyLibraryVideo[] = await res.json();
      setBunnyLibrary(items);
      setImportDrafts(
        Object.fromEntries(
          items.map((v) => [
            v.guid,
            { title: v.title, slug: slugify(v.title), target: formatTarget(seriesId, categoryId) },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list Bunny videos");
    } finally {
      setBunnyLoading(false);
    }
  }

  function updateDraft(guid: string, field: "title" | "slug" | "target", value: string) {
    setImportDrafts((prev) => ({ ...prev, [guid]: { ...prev[guid], [field]: value } }));
  }

  async function importVideo(guid: string) {
    const draft = importDrafts[guid];
    if (!draft?.title.trim() || !draft?.slug.trim()) {
      setError("Title and slug are required to import a video");
      return;
    }
    const target = scoped
      ? { seriesId: seriesId ?? null, categoryId: categoryId ?? null }
      : parseTarget(draft.target);
    setImportingGuid(guid);
    setError(null);
    try {
      const res = await fetch("/api/admin/videos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bunnyVideoId: guid,
          title: draft.title,
          slug: draft.slug,
          seriesId: target.seriesId,
          categoryId: target.categoryId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Import failed");
      setBunnyLibrary((prev) => prev?.filter((v) => v.guid !== guid) ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingGuid(null);
    }
  }

  async function uploadVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);

    const target = scoped
      ? { seriesId: seriesId ?? null, categoryId: categoryId ?? null }
      : parseTarget(pickedTarget);

    try {
      const createRes = await fetch("/api/admin/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slugify(title),
          seriesId: target.seriesId,
          categoryId: target.categoryId,
        }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Failed to create");
      const { video, upload } = await createRes.json();

      await new Promise<void>((resolve, reject) => {
        const tusUpload = new Upload(file, {
          endpoint: upload.endpoint,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            AuthorizationSignature: upload.signature,
            AuthorizationExpire: String(upload.expirationTime),
            VideoId: upload.videoId,
            LibraryId: upload.libraryId,
          },
          metadata: { filetype: file.type, title },
          onError: reject,
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        tusUpload.start();
      });

      await fetch(`/api/admin/videos/${video.id}/sync-status`, { method: "POST" });

      setTitle("");
      setPickedTarget("");
      setFile(null);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  async function refreshStatus(id: string) {
    await fetch(`/api/admin/videos/${id}/sync-status`, { method: "POST" });
    await load();
  }

  async function setExpiry(v: Video) {
    const input = prompt(
      "Unpublish this video at (YYYY-MM-DDTHH:MM, local time)? Leave blank to clear.",
      "",
    );
    if (input === null) return;
    const unpublishAt = input.trim() ? new Date(input.trim()).toISOString() : null;
    await fetch(`/api/admin/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unpublishAt }),
    });
    await load();
  }

  async function setPremiere(v: Video) {
    const input = prompt(
      "Premiere at (YYYY-MM-DDTHH:MM, local time)? The video shows a countdown until then. Leave blank to clear.",
      v.publishAt ? v.publishAt.slice(0, 16) : "",
    );
    if (input === null) return;
    const body = input.trim()
      ? { isPremiere: true, published: true, publishAt: new Date(input.trim()).toISOString() }
      : { isPremiere: false };
    await fetch(`/api/admin/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function toggle(v: Video, field: "published" | "memberOnly" | "hidden") {
    await fetch(`/api/admin/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !v[field] }),
    });
    await load();
  }

  async function reassignTarget(id: string, target: string) {
    const parsed = parseTarget(target);
    await fetch(`/api/admin/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: parsed.seriesId, categoryId: parsed.categoryId }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this video? This also removes it from Bunny Stream.")) return;
    await fetch(`/api/admin/videos/${id}`, { method: "DELETE" });
    await load();
  }

  const scopedVideos = seriesId
    ? videos.filter((v) => v.series?.id === seriesId)
    : categoryId
      ? videos.filter((v) => v.category?.id === categoryId)
      : videos;
  const visibleVideos =
    !scoped && query.trim()
      ? scopedVideos.filter((v) => v.title.toLowerCase().includes(query.trim().toLowerCase()))
      : scopedVideos;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSetPublished(published: boolean) {
    await fetch("/api/admin/videos/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: published ? "publish" : "unpublish" }),
    });
    setSelectedIds(new Set());
    await load();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} video(s)? This also removes them from Bunny Stream.`))
      return;
    await fetch("/api/admin/videos/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
    });
    setSelectedIds(new Set());
    await load();
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(visibleVideos, fromIndex, toIndex);
    await Promise.all(
      reordered.map((v, i) =>
        fetch(`/api/admin/videos/${v.id}`, {
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
    if (targetIndex < 0 || targetIndex >= visibleVideos.length) return;
    await reorderTo(index, targetIndex);
  }

  const { draggingIndex, handleProps, dropZoneProps } = useDragReorder(reorderTo);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">
        {seriesId ? "Episodes" : categoryId ? "Videos in category" : "All videos"}
      </h2>

      <form
        onSubmit={uploadVideo}
        className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={seriesId ? "Episode title" : "Video title"}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex flex-wrap items-center gap-3">
          {!scoped && (
            <TargetSelect value={pickedTarget} onChange={setPickedTarget} seriesList={seriesList} categoryList={categoryList} />
          )}
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm max-w-full"
            required
          />
          <button
            type="submit"
            disabled={progress !== null}
            className="sm:ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Upload
          </button>
        </div>
        {progress !== null && (
          <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-2 rounded-full bg-zinc-900 dark:bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Import existing Bunny videos</h3>
          <button
            onClick={() => {
              const next = !showImport;
              setShowImport(next);
              if (next && bunnyLibrary === null) loadBunnyLibrary();
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {showImport ? "Hide" : "Show"}
          </button>
        </div>

        {showImport && (
          <div className="space-y-3">
            <button
              onClick={loadBunnyLibrary}
              disabled={bunnyLoading}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              {bunnyLoading ? "Checking…" : "Check for new videos"}
            </button>

            {bunnyLibrary?.length === 0 && (
              <p className="text-sm text-zinc-500">
                Everything already in your Bunny Stream library has been imported.
              </p>
            )}

            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
              {bunnyLibrary?.map((v) => {
                const draft = importDrafts[v.guid];
                return (
                  <li key={v.guid} className="p-3 space-y-2">
                    <p className="text-sm text-zinc-500">
                      Bunny: {v.title} · uploaded {new Date(v.dateUploaded).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={draft?.title ?? ""}
                        onChange={(e) => updateDraft(v.guid, "title", e.target.value)}
                        placeholder="Title"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <input
                        value={draft?.slug ?? ""}
                        onChange={(e) => updateDraft(v.guid, "slug", e.target.value)}
                        placeholder="slug"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      {!scoped && (
                        <TargetSelect
                          value={draft?.target ?? ""}
                          onChange={(value) => updateDraft(v.guid, "target", value)}
                          seriesList={seriesList}
                          categoryList={categoryList}
                        />
                      )}
                      <button
                        onClick={() => importVideo(v.guid)}
                        disabled={importingGuid === v.guid}
                        className="ml-auto rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                      >
                        {importingGuid === v.guid ? "Importing…" : "Import"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {!scoped && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter videos by title…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}

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
          <button onClick={bulkDelete} className="rounded-md border border-red-300 px-2 py-1 text-red-600 dark:border-red-900">
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {visibleVideos.map((v, index) => (
          <li
            key={v.id}
            className={draggingIndex === index ? "opacity-40" : ""}
            {...(scoped ? dropZoneProps(index) : {})}
          >
          <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(v.id)}
                onChange={() => toggleSelected(v.id)}
                aria-label={`Select ${v.title}`}
              />
              {scoped && <DragHandle {...handleProps(index)} />}
              {v.thumbnailPreviewUrl && (
                <Image
                  src={v.thumbnailPreviewUrl}
                  alt=""
                  width={64}
                  height={40}
                  className="h-10 w-16 shrink-0 rounded object-cover bg-zinc-100 dark:bg-zinc-800"
                />
              )}
              <div className="min-w-0">
                <p className="font-medium">{v.title}</p>
                <p className="text-sm text-zinc-500">{v.status}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {scoped && (
                <>
                  <PositionInput
                    index={index}
                    total={visibleVideos.length}
                    onReorder={(toIndex) => reorderTo(index, toIndex)}
                  />
                  <button
                    onClick={() => move(index, "up")}
                    disabled={index === 0}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, "down")}
                    disabled={index === visibleVideos.length - 1}
                    className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-30 dark:border-zinc-700"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </>
              )}
              {!scoped && (
                <TargetSelect
                  value={formatTarget(v.series?.id ?? null, v.category?.id ?? null)}
                  onChange={(value) => reassignTarget(v.id, value)}
                  seriesList={seriesList}
                  categoryList={categoryList}
                />
              )}
              {/* Always available, not just while encoding: this also re-syncs
                  the thumbnail file name, which changes whenever a thumbnail is
                  set outside this app (e.g. in Bunny's own dashboard). */}
              <button
                onClick={() => refreshStatus(v.id)}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                title="Re-read status, duration, and thumbnail from Bunny"
              >
                {v.status === "READY" ? "Sync from Bunny" : "Refresh status"}
              </button>
              <button
                onClick={() => toggle(v, "published")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {v.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => setExpiry(v)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${v.unpublishAt ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-zinc-300"}`}
                title={v.unpublishAt ? `Unpublishes ${new Date(v.unpublishAt).toLocaleString()}` : undefined}
              >
                {v.unpublishAt ? "Expires" : "Set expiry"}
              </button>
              <button
                onClick={() => toggle(v, "memberOnly")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                {v.memberOnly ? "Members only" : "Public"}
              </button>
              <button
                onClick={() => toggle(v, "hidden")}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${v.hidden ? "border-red-400 text-red-600 dark:text-red-400" : "border-zinc-300"}`}
              >
                {v.hidden ? "Hidden" : "Visible"}
              </button>
              <button
                onClick={() => setPremiere(v)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${v.isPremiere ? "border-purple-400 text-purple-700 dark:text-purple-400" : "border-zinc-300"}`}
                title={v.isPremiere && v.publishAt ? `Premieres ${new Date(v.publishAt).toLocaleString()}` : undefined}
              >
                {v.isPremiere ? "Premiere set" : "Schedule premiere"}
              </button>
              <button
                onClick={() => setManagingThumbnailId(managingThumbnailId === v.id ? null : v.id)}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                Thumbnail
              </button>
              <button
                onClick={() => setManagingChaptersId(managingChaptersId === v.id ? null : v.id)}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                Chapters
              </button>
              <button
                onClick={() => setManagingAccessId(managingAccessId === v.id ? null : v.id)}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
              >
                Viewers
              </button>
              <button onClick={() => remove(v.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </div>
          {managingThumbnailId === v.id && (
            <div className="px-4 pb-4">
              <ThumbnailManager videoId={v.id} currentUrl={v.thumbnailPreviewUrl} onChange={load} />
            </div>
          )}
          {managingChaptersId === v.id && (
            <div className="px-4 pb-4">
              <ChapterManager videoId={v.id} />
            </div>
          )}
          {managingAccessId === v.id && (
            <div className="px-4 pb-4">
              <ViewerAccessManager type="video" id={v.id} />
            </div>
          )}
          </li>
        ))}
        {visibleVideos.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">
            {seriesId ? "No episodes in this series yet." : categoryId ? "No videos in this category yet." : "No videos yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
