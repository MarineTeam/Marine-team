"use client";

import { useCallback, useEffect, useState } from "react";

type Kind = "YOUTUBE_CHANNEL" | "YOUTUBE_PLAYLIST" | "VIMEO_USER" | "VIMEO_SHOWCASE";

type Feed = {
  id: string;
  kind: Kind;
  externalId: string;
  name: string;
  seriesId: string | null;
  categoryId: string | null;
  autoPublish: boolean;
  lookBack: number;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  videoCount: number;
  unavailable: string | null;
};

const KIND_LABELS: Record<Kind, string> = {
  YOUTUBE_CHANNEL: "YouTube channel",
  YOUTUBE_PLAYLIST: "YouTube playlist",
  VIMEO_USER: "Vimeo account",
  VIMEO_SHOWCASE: "Vimeo showcase",
};

const KIND_HINTS: Record<Kind, string> = {
  YOUTUBE_CHANNEL: "The channel id, which starts UC… — not the @handle.",
  YOUTUBE_PLAYLIST: "The playlist id, from the list= part of its URL.",
  VIMEO_USER: "The numeric user id, or your Vimeo username.",
  VIMEO_SHOWCASE: "The showcase (album) id, from its URL.",
};

/**
 * Feeds to import from.
 *
 * A church that already streams its service to YouTube every Sunday has the
 * sermon there before it thinks about this app. This points at it rather than
 * asking anybody to upload it twice.
 */
export function VideoFeedsManager() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [kind, setKind] = useState<Kind>("YOUTUBE_CHANNEL");
  const [externalId, setExternalId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/video-feeds");
    if (response.ok) {
      const body = await response.json();
      setFeeds(body.feeds);
      setSeries(body.series);
      setCategories(body.categories);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/video-feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, externalId, name }),
    });
    if (response.ok) {
      setExternalId("");
      setName("");
      await load();
    } else {
      setError((await response.json()).error ?? "Couldn't add that.");
    }
  }

  async function update(feed: Feed, patch: Partial<Feed>) {
    setFeeds((current) => current.map((f) => (f.id === feed.id ? { ...f, ...patch } : f)));
    await fetch(`/api/admin/video-feeds/${feed.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function sync(feed: Feed) {
    setBusy(feed.id);
    setOutcome(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/video-feeds/${feed.id}/sync`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The import failed.");
      setOutcome(
        body.status === "FAILED"
          ? body.error
          : body.status === "UNCHANGED"
            ? "Nothing new since last time."
            : `${body.imported} imported, ${body.updated} updated, ${body.skipped} left alone.`,
      );
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "The import failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(feed: Feed) {
    if (
      !window.confirm(
        `Stop importing from "${feed.name}"?\n\nThe ${feed.videoCount} videos it brought in stay — they've been filed and watched. Only the link to the source goes.`,
      )
    ) {
      return;
    }
    await fetch(`/api/admin/video-feeds/${feed.id}`, { method: "DELETE" });
    await load();
  }

  const field = "rounded-md border border-sep px-3 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
        <label className="text-sm">
          <span className="block text-sec">Source</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={`mt-1 ${field}`}>
            {(Object.keys(KIND_LABELS) as Kind[]).map((option) => (
              <option key={option} value={option}>
                {KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-sec">Id</span>
          <input
            required
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-sm">
          <span className="block text-sec">Call it</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <button type="submit" className="btn-primary rounded-md px-3 py-1.5 text-sm text-white">
          Add
        </button>
        <p className="w-full text-xs text-ter">{KIND_HINTS[kind]}</p>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>

      {outcome && <p className="text-sm text-sec">{outcome}</p>}

      {feeds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No sources yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {feeds.map((feed) => (
            <li key={feed.id} className="space-y-3 rounded-lg border border-sep p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{feed.name}</p>
                  <p className="text-xs text-sec">
                    {KIND_LABELS[feed.kind]} · {feed.externalId} · {feed.videoCount} imported
                  </p>
                  <p className="text-xs text-ter">
                    {feed.lastSyncedAt
                      ? `Last checked ${new Date(feed.lastSyncedAt).toLocaleString("en-GB")} · ${feed.lastSyncStatus?.toLowerCase()}`
                      : "Never checked"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => sync(feed)}
                    disabled={busy === feed.id || Boolean(feed.unavailable)}
                    className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-60"
                  >
                    {busy === feed.id ? "Importing…" : "Import now"}
                  </button>
                  <button
                    onClick={() => remove(feed)}
                    className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {feed.unavailable && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  {feed.unavailable}
                </p>
              )}
              {feed.lastError && (
                <p className="text-xs text-red-600">{feed.lastError}</p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-xs text-sec">File imports under</span>
                  <select
                    value={feed.seriesId ? `s:${feed.seriesId}` : feed.categoryId ? `c:${feed.categoryId}` : ""}
                    onChange={(e) => {
                      const [type, id] = e.target.value.split(":");
                      update(feed, type === "s" ? { seriesId: id, categoryId: null } : type === "c" ? { categoryId: id, seriesId: null } : { seriesId: null, categoryId: null });
                    }}
                    className={`mt-1 ${field}`}
                  >
                    <option value="">Nowhere in particular</option>
                    {series.map((option) => (
                      <option key={option.id} value={`s:${option.id}`}>
                        {option.title}
                      </option>
                    ))}
                    {categories.map((option) => (
                      <option key={option.id} value={`c:${option.id}`}>
                        {option.name} (category)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-sec">Look back over</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={feed.lookBack}
                    onChange={(e) => update(feed, { lookBack: Number(e.target.value) })}
                    className={`mt-1 w-20 ${field}`}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={feed.autoPublish}
                    onChange={(e) => update(feed, { autoPublish: e.target.checked })}
                  />
                  Publish straight away
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={feed.enabled}
                    onChange={(e) => update(feed, { enabled: e.target.checked })}
                  />
                  Check it nightly
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
