"use client";

import { useCallback, useEffect, useState } from "react";
import { readDeviceSettings } from "@/lib/device-settings";
import { formatBytes, isLikelyCellular } from "@/lib/offline-downloads";
import {
  checkSavedBook,
  offlineBooksSupported,
  type OfflineBookFormat,
  readOfflineBooks,
  removeOfflineBook,
  saveBookWithContents,
  type SavedBookStatus,
} from "@/lib/offline-books";

type State = "idle" | "saving" | "done" | "error";

/**
 * Keeps a book on this device, so it opens with no connection at all.
 *
 * Saving stores three things, and all three matter: the file's bytes, pdf.js
 * itself (the offline shell is a static page with no bundle to draw pages
 * with), and the book's contents list — read out of the bytes just downloaded
 * rather than by fetching the file a second time. Without the contents there
 * is no way to find hymn 214 offline, which is the whole point of having the
 * book on the device.
 *
 * Where it lives in the app (`homeHref`) is stored with it, so the offline
 * shell can answer a tap on the Hymnals icon with the hymnals — it has no
 * server to ask.
 */
export function SaveBookButton({
  fileId,
  title,
  format,
  homeHref,
  homeLabel,
  categoryHref,
  categoryLabel,
  pageOffset,
  sizeBytes,
}: {
  fileId: string;
  title: string;
  /** Which reader opens it, so the right library is saved alongside it. */
  format: OfflineBookFormat;
  homeHref: string | null;
  homeLabel: string | null;
  categoryHref: string | null;
  categoryLabel: string | null;
  pageOffset: number;
  sizeBytes: number | null;
}) {
  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  // Whether Cache Storage exists here is a client-only fact; hidden until
  // it's known rather than flashed and withdrawn, hence the false default.
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<SavedBookStatus>("unknown");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(offlineBooksSupported());
    const book = readOfflineBooks().find((item) => item.id === fileId);
    if (book) {
      setState("done");
      // Asked once, on the page where something can be done about it: a copy
      // of a book that has since been re-scanned is worth knowing about
      // before the next Sunday it's needed.
      void checkSavedBook(book).then(setStatus);
    }
  }, [fileId]);

  const save = useCallback(async () => {
    setMessage(null);
    // The same courtesy the video download does: a hymnal is tens of
    // megabytes, and nobody wants to find that on their data bill.
    if (!readDeviceSettings().downloadOverCellular && isLikelyCellular()) {
      setMessage("You're on mobile data. Allow downloads over data in your profile settings, or wait for Wi-Fi.");
      return;
    }

    setState("saving");
    setProgress(0);
    try {
      await saveBookWithContents(
        { id: fileId, title, format, homeHref, homeLabel, categoryHref, categoryLabel, pageOffset, sizeBytes },
        (fraction) => setProgress(fraction),
      );
      setStatus("current");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't save this book.");
    }
  }, [fileId, title, format, homeHref, homeLabel, categoryHref, categoryLabel, pageOffset, sizeBytes]);

  async function remove() {
    await removeOfflineBook(fileId);
    setStatus("unknown");
    setState("idle");
    setProgress(0);
  }

  if (!visible) return null;

  return (
    <div className="space-y-1">
      {state === "done" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 dark:border-green-900 dark:text-green-400">
            ✓ Saved on this device
          </span>
          {/*
            Only offered when there is something to update to: a scanned book
            rarely changes, so a permanent Update button here would be an
            invitation to re-download 40MB for nothing.
          */}
          {status === "outdated" && (
            <button onClick={save} className="rounded-md btn-primary px-3 py-1.5 text-white">
              Update available
            </button>
          )}
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
          {state === "saving"
            ? `Saving… ${Math.round(progress * 100)}%`
            : `Save for offline${sizeBytes ? ` (${formatBytes(sizeBytes)})` : ""}`}
        </button>
      )}
      {state === "done" && (
        <p className="text-xs text-sec">
          {status === "outdated"
            ? "This book has been replaced since you saved it — Update to get the current one."
            : status === "unavailable"
              ? "This book isn't available to this account any more. Your saved copy still opens offline."
              : "Opens with no connection from this book's icon in the bottom bar, or from the offline screen."}
        </p>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
