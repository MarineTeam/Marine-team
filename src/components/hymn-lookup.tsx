"use client";

import { useEffect, useRef } from "react";

/**
 * Says, once, that this hymn was opened.
 *
 * Renders nothing. It exists because the counting has to happen in the
 * browser: Next prefetches links on hover, so a server-side count of hymn
 * pages would mostly be a count of mice passing over a list of them.
 *
 * `keepalive` because opening a hymn is frequently followed straight away by
 * going somewhere else — a search result opened, glanced at, and left — and
 * a request the browser abandons on navigation would drop exactly the
 * lookups that mattered most.
 */
export function HymnLookup({
  fileId,
  number = null,
  source,
}: {
  fileId: string;
  /** The number on the board, for a hymn inside a whole-book hymnal. */
  number?: number | null;
  source: "hymn" | "book" | "reader" | "present";
}) {
  // Strict Mode runs effects twice in development, and a remount on the same
  // hymn (a page-number change in the reader) is not a second opening.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${fileId}:${number ?? ""}:${source}`;
    if (sent.current === key) return;
    sent.current = key;

    void fetch("/api/hymns/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, number, source }),
      keepalive: true,
      // Nothing here is worth a failed request in the console: an ad
      // blocker, a dropped connection or a closed tab all just mean this
      // opening goes uncounted.
    }).catch(() => {});
  }, [fileId, number, source]);

  return null;
}
