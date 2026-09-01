"use client";

import { useState } from "react";

/**
 * Copies a link to the hymn open in the reader right now.
 *
 * The reader's own URL is a page number, which is the wrong thing to send
 * somebody: page 230 means nothing to a person holding a different edition,
 * and it stops meaning anything here the moment the book is re-scanned. A
 * numbered hymn is linked by its number instead — `/books/<id>?hymn=214`,
 * which the book's contents resolve on arrival — and only an unnumbered spot
 * falls back to the page it is on.
 */
export function CopyHymnLink({
  fileId,
  hymnNumber,
  currentPage,
}: {
  fileId: string;
  /** The number of the hymn being read, when the book numbers its contents. */
  hymnNumber: number | null;
  /**
   * Where the reader is right now, for a book whose contents aren't numbered.
   * A function rather than a value: the page turns under this button without
   * it re-rendering, and copying the page somebody was on two turns ago would
   * be wrong in the quietest possible way.
   */
  currentPage: () => string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const page = currentPage();
    const path =
      hymnNumber !== null
        ? `/books/${fileId}?hymn=${hymnNumber}`
        : page
          ? `/read/${fileId}?page=${page}`
          : `/books/${fileId}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard needs a secure context and isn't always there; the
      // button simply does nothing rather than claiming it worked.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={hymnNumber !== null ? `Copy a link to hymn ${hymnNumber}` : "Copy a link to this page"}
      className="rounded-md border border-sep px-2 py-1.5 text-xs hover:bg-hover"
    >
      {copied ? "Copied" : "Link"}
    </button>
  );
}
