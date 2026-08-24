"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes, isLikelyCellular } from "@/lib/offline-downloads";
import { readDeviceSettings } from "@/lib/device-settings";
import {
  checkSavedBook,
  isBookSaved,
  offlineBooksSupported,
  readOfflineBooks,
  removeOfflineBook,
  saveHymnalOffline,
  type OfflineHymn,
  type SavedBookStatus,
} from "@/lib/offline-books";

type State = "idle" | "saving" | "done" | "error";

/**
 * Keeps a hymn-per-file book on this device — the whole hymnal, as lyrics.
 *
 * The sibling of SaveBookButton, and separate because the thing being saved
 * is different in kind: a book like this has no file to store, so what's kept
 * is the list of hymns the server would have rendered (see
 * /api/offline/hymnal/[seriesId]). Hymns with no lyrics text aren't included
 * — offline they'd be blank — which is why the button reports how many were
 * actually saved rather than how many the book has.
 */
export function SaveHymnalButton({
  seriesId,
  title,
  homeHref,
  homeLabel,
  categoryHref,
  categoryLabel,
}: {
  seriesId: string;
  title: string;
  homeHref: string;
  homeLabel: string;
  categoryHref: string | null;
  categoryLabel: string | null;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ hymnCount?: number; bytes: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<SavedBookStatus>("unknown");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(offlineBooksSupported());
    const book = readOfflineBooks().find((item) => item.id === seriesId);
    if (isBookSaved(seriesId)) {
      setState("done");
      setSaved(book ?? null);
      // Lyrics get corrected and hymns get added; a copy saved in March
      // shouldn't quietly still be March's book in December.
      if (book) void checkSavedBook(book).then(setStatus);
    }
  }, [seriesId]);

  const save = useCallback(async () => {
    setMessage(null);
    if (!readDeviceSettings().downloadOverCellular && isLikelyCellular()) {
      setMessage("You're on mobile data. Allow downloads over data in your profile settings, or wait for Wi-Fi.");
      return;
    }

    setState("saving");
    try {
      const response = await fetch(`/api/offline/hymnal/${seriesId}`, { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Couldn't fetch this hymnal. Check your connection and try again.");
      }
      const hymns: OfflineHymn[] = Array.isArray(data.hymns) ? data.hymns : [];
      if (hymns.length === 0) {
        throw new Error("None of these hymns have lyrics saved yet, so there's nothing to keep offline.");
      }
      setSaved(
        await saveHymnalOffline(
          { id: seriesId, title, homeHref, homeLabel, categoryHref, categoryLabel },
          hymns,
          typeof data.fingerprint === "string" ? data.fingerprint : null,
        ),
      );
      setStatus("current");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't save this hymnal.");
    }
  }, [seriesId, title, homeHref, homeLabel, categoryHref, categoryLabel]);

  async function remove() {
    await removeOfflineBook(seriesId);
    setSaved(null);
    setStatus("unknown");
    setState("idle");
  }

  if (!visible) return null;

  return (
    <div className="space-y-1">
      {state === "done" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 dark:border-green-900 dark:text-green-400">
            ✓ {saved?.hymnCount ? `${saved.hymnCount} hymns` : "Saved"} on this device
            {saved?.bytes ? ` (${formatBytes(saved.bytes)})` : ""}
          </span>
          {/*
            Offered where the PDF version isn't: lyrics get corrected and
            added long after a scan of the book would have stopped changing.
          */}
          <button
            onClick={save}
            className={`rounded-md border px-3 py-1.5 ${
              status === "outdated" ? "btn-primary border-transparent text-white" : "border-sep hover:bg-hover"
            }`}
          >
            {status === "outdated" ? "Update available" : "Update"}
          </button>
          <button onClick={remove} className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover">
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save for offline"}
        </button>
      )}
      {state === "done" && (
        <p className="text-xs text-sec">
          {status === "outdated"
            ? "This book has changed since you saved it — Update to get the current hymns and lyrics."
            : status === "unavailable"
              ? "This book isn't available to this account any more. Your saved copy still opens offline."
              : "The hymns and their lyrics open with no connection, from this section's icon in the bottom bar."}
        </p>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
