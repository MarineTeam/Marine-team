"use client";

import { useCallback, useEffect, useState } from "react";
import { ShareLinkForm } from "@/components/share-link-form";
import { ShareLinkList, type ShareLinkRow } from "@/components/share-link-list";

type SeriesOption = { id: string; title: string };
type VideoOption = { id: string; title: string };

type Filter = "all" | "active" | "revoked";

/** Mirrors statusOf in share-link-list: expiry is derived, not a stored flag. */
function isActive(link: ShareLinkRow): boolean {
  if (link.revokedAt) return false;
  return !link.expiresAt || new Date(link.expiresAt) > new Date();
}

/**
 * Every share link on the site: who shared what with whom, how often it's
 * been opened, and a revoke button for each — plus a form to share something
 * on behalf of the church without first navigating to its page.
 */
export default function ShareLinksAdminPage() {
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [videoList, setVideoList] = useState<VideoOption[]>([]);
  const [target, setTarget] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/share-links");
    if (res.ok) setLinks(await res.json());
    else setError((await res.json()).error ?? "Failed to load share links");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // The pickers only need id + title; both endpoints already return the
    // full rows the rest of the admin uses, so no new API is needed here.
    // They're scoped to content the caller can *edit*, so someone holding
    // only `share_content` sees an empty picker and shares from the content
    // page instead — the list of existing links below is unaffected.
    (async () => {
      const [seriesRes, videosRes] = await Promise.all([
        fetch("/api/admin/series"),
        fetch("/api/admin/videos"),
      ]);
      if (seriesRes.ok) setSeriesList(await seriesRes.json());
      if (videosRes.ok) setVideoList(await videosRes.json());
    })();
  }, [load]);

  const parsedTarget = target.startsWith("s:")
    ? { seriesId: target.slice(2) }
    : target.startsWith("v:")
      ? { videoId: target.slice(2) }
      : null;

  const shown = links.filter((link) =>
    filter === "all" ? true : filter === "active" ? isActive(link) : !isActive(link),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Share links</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Links handed out by anyone on the site. A link marked “Grants access” lets its holder watch content they
          otherwise couldn&apos;t — revoke it to cut that off immediately.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Share something</h2>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Content to share"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Choose a series or video…</option>
          <optgroup label="Series">
            {seriesList.map((s) => (
              <option key={`s:${s.id}`} value={`s:${s.id}`}>
                {s.title}
              </option>
            ))}
          </optgroup>
          <optgroup label="Videos">
            {videoList.map((v) => (
              <option key={`v:${v.id}`} value={`v:${v.id}`}>
                {v.title}
              </option>
            ))}
          </optgroup>
        </select>
        {/* The override is always offered here: reaching this page means
            holding `share_content`. It's a no-op on content that isn't
            restricted, and the API still refuses a grant outside the scope
            the capability was granted for. */}
        <ShareLinkForm
          target={parsedTarget}
          endpoint="/api/admin/share-links"
          disabled={!parsedTarget}
          canGrantAccess
          onCreated={(link) => setLinks((current) => [link, ...current])}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["all", "active", "revoked"] as Filter[]).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1 capitalize ${
                filter === value
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              {value === "revoked" ? "Revoked or expired" : value}
            </button>
          ))}
          <span className="text-zinc-500">
            {shown.length} of {links.length}
          </span>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ShareLinkList links={shown} revokeEndpoint="/api/admin/share-links" showOwner onChange={load} />
      </section>
    </div>
  );
}
