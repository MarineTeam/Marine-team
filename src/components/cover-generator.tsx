"use client";

import { useState } from "react";
import { derivePdfBookCard, fileContentUrl } from "@/lib/pdf-client";

export type CoverCandidate = {
  id: string;
  title: string;
  coverDataUrl: string | null;
};

/**
 * Derives book covers and hymn counts once, here, instead of in every
 * visitor's browser.
 *
 * Without a stored cover a book card opens its PDF to draw the first page
 * and count bookmarks — cheap per card, but paid again by every visitor on
 * every page load, since file bytes are deliberately served uncacheable.
 * Running this once turns that into a thumbnail that ships with the page.
 *
 * Deliberately client-side: rendering a PDF page needs a canvas, and doing
 * it in a serverless function would mean shipping a headless canvas build
 * to run what the admin's browser can already do.
 */
export function CoverGenerator({
  files,
  onGenerated,
}: {
  files: CoverCandidate[];
  onGenerated: () => Promise<void> | void;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const missing = files.filter((f) => !f.coverDataUrl);
  if (files.length === 0) return null;

  async function generate(targets: CoverCandidate[]) {
    setRunning(true);
    setDone(0);
    setFailed([]);
    setResult(null);

    const problems: string[] = [];
    // One at a time: each opens a PDF and rasterises a page, and a dozen at
    // once would compete for memory and the same connection for no gain.
    for (const file of targets) {
      try {
        const derived = await derivePdfBookCard(fileContentUrl(file.id));
        const res = await fetch(`/api/admin/files/${file.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(derived),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      } catch {
        problems.push(file.title);
      }
      setDone((n) => n + 1);
    }

    setFailed(problems);
    setResult(
      `Generated ${targets.length - problems.length} of ${targets.length}` +
        (problems.length > 0 ? ` — ${problems.length} couldn't be read` : ""),
    );
    setRunning(false);
    await onGenerated();
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => generate(missing)}
          disabled={running || missing.length === 0}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          {running
            ? `Generating… ${done}/${missing.length}`
            : missing.length === 0
              ? "All covers generated"
              : `Generate ${missing.length} cover${missing.length === 1 ? "" : "s"}`}
        </button>
        {!running && files.length > missing.length && (
          <button
            type="button"
            onClick={() => generate(files)}
            className="text-sm text-zinc-500 hover:underline"
          >
            Regenerate all {files.length}
          </button>
        )}
        {result && <span className="text-sm text-green-600">{result}</span>}
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Draws each PDF&apos;s first page as its cover and counts its bookmarked hymns, so visitors
        get a thumbnail with the page instead of each browser opening the PDF to work it out.
      </p>

      {failed.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-600">
          {failed.map((title) => (
            <li key={title}>{title}: couldn&apos;t read this PDF</li>
          ))}
        </ul>
      )}
    </div>
  );
}
