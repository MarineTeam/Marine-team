"use client";

import { useState } from "react";
import { derivePdfBook, fileContentUrl } from "@/lib/pdf-client";

export type CoverCandidate = {
  id: string;
  title: string;
  coverDataUrl: string | null;
  /** Null for a book whose contents have never been read into the index. */
  contentsIndexedAt: string | null;
};

/**
 * Derives what a book's row can hold — its cover, its hymn count and its
 * contents — once, here, instead of in every visitor's browser.
 *
 * Without a stored cover a book card opens its PDF to draw the first page
 * and count bookmarks — cheap per card, but paid again by every visitor on
 * every page load, since file bytes are deliberately served uncacheable.
 * Running this once turns that into a thumbnail that ships with the page.
 *
 * The contents are the reason this now matters more than a thumbnail: a
 * hymn inside a scanned book exists only in that PDF's bookmarks, so until
 * they are resolved and stored, no search can see it and a category of six
 * hymnals can't be searched at all.
 *
 * Deliberately client-side: rendering a page and resolving an outline both
 * need pdf.js, and doing it in a serverless function would mean shipping a
 * headless canvas build to run what the admin's browser can already do.
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

  // A book missing either half needs the pass: they come from one opening of
  // the file, so there is no sense in doing them separately.
  const missing = files.filter((f) => !f.coverDataUrl || !f.contentsIndexedAt);
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
        const { contents, ...card } = await derivePdfBook(fileContentUrl(file.id));
        const res = await fetch(`/api/admin/files/${file.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");

        // An entry whose destination never resolved has no page to send.
        const entries = contents
          .filter((entry) => entry.location !== null)
          .map((entry) => ({ title: entry.label, page: Number(entry.location), depth: entry.depth }));

        // A PDF with no usable bookmarks has nothing to say about its own
        // contents — and a book like that is exactly the one somebody will
        // have typed the contents of by hand. Sending an empty list would
        // replace that evening's work with nothing, from a button that
        // says it generates covers.
        if (entries.length > 0) {
          // Sent separately because it is a different shape of thing — rows
          // of its own, replaced whole — rather than more columns on the row.
          const indexed = await fetch(`/api/admin/files/${file.id}/contents`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
          });
          if (!indexed.ok) throw new Error((await indexed.json()).error ?? "Indexing failed");
        }
      } catch {
        problems.push(file.title);
      }
      setDone((n) => n + 1);
    }

    setFailed(problems);
    setResult(
      `Indexed ${targets.length - problems.length} of ${targets.length}` +
        (problems.length > 0 ? ` — ${problems.length} couldn't be read` : ""),
    );
    setRunning(false);
    await onGenerated();
  }

  return (
    <div className="rounded-lg border border-sep p-4">
      <h3 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
        Book covers &amp; hymn index
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => generate(missing)}
          disabled={running || missing.length === 0}
          className="rounded-md border border-sep px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {running
            ? `Indexing… ${done}/${missing.length}`
            : missing.length === 0
              ? "All books indexed"
              : `Index ${missing.length} book${missing.length === 1 ? "" : "s"}`}
        </button>
        {!running && files.length > missing.length && (
          <button
            type="button"
            onClick={() => generate(files)}
            className="text-sm text-sec hover:underline"
          >
            Reindex all {files.length}
          </button>
        )}
        {result && <span className="text-sm text-green-600">{result}</span>}
      </div>

      <p className="mt-2 text-xs text-sec">
        Reads each PDF&apos;s contents into the search index — so a hymn inside a scanned book can be
        found by name or number from its hymnal section and from search — and draws its first page as
        a cover, so visitors get a thumbnail with the page instead of each browser opening the PDF to
        work it out. Run this once after adding a book; a hymnal section shows no search box until at
        least one of its books has been indexed.
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
