"use client";

import { useState } from "react";

/**
 * "Download my data", next to "Delete my account" — deliberately, because they
 * are the same decision seen from two sides, and somebody about to press the
 * second one should see the first without going looking for it.
 *
 * Fetches rather than being a plain `<a download>`: the route can answer 429 or
 * 500, and a bare link would drop that JSON into a new tab as the only reply a
 * member ever gets. Saving from a blob keeps the failure on this page, next to
 * a sentence they can read.
 */
export function DownloadMyData() {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setWorking(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const res = await fetch("/api/profile/export");
      if (!res.ok) {
        throw new Error(((await res.json()) as { error?: string }).error ?? "Couldn't build your file");
      }
      // The server named the file; keep its name so two exports don't collide
      // in a downloads folder. Fall back only if the header is missing.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      objectUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = named ?? "marine-team-export.json";
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build your file");
    } finally {
      // Safari needs the URL to still resolve when the click is handled, so
      // this waits a tick rather than revoking underneath it.
      const created = objectUrl;
      if (created) setTimeout(() => URL.revokeObjectURL(created), 30_000);
      setWorking(false);
    }
  }

  return (
    <div className="rounded-lg border border-sep p-4">
      <h3 className="text-sm font-medium text-ink">Download your data</h3>
      <p className="mt-1 text-xs text-sec">
        A file holding everything we have about your account — your notes, highlights, comments, prayer requests,
        sign-ups, playlists, watch history and messages. Other people&apos;s words aren&apos;t in it, and neither are
        sign-in keys.
      </p>
      <button
        onClick={download}
        disabled={working}
        className="mt-3 rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-50"
      >
        {working ? "Building your file…" : "Download my data"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
