"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  offlineCalendarSupported,
  readOfflineCalendar,
  removeCalendarOffline,
  syncCalendarOffline,
  type OfflineCalendar,
} from "@/lib/offline-calendar";

type State = "idle" | "saving" | "done" | "error";

/**
 * Keeps the calendar on this device.
 *
 * The odd one out among the save buttons, in two ways. It is the smallest
 * thing the app can save — a year of rotas is a few kilobytes of text against
 * a hymnal's forty megabytes — and it is the only one that goes stale by
 * itself: a rota gets reworked weeks before the Sunday it describes. So once
 * somebody has opted in, opening this page with a connection quietly brings
 * the copy up to date, asking the server only for what changed since the last
 * time. Nobody should have to remember to press "update" to find out they are
 * on for next week.
 */
export function SaveCalendarButton() {
  const [state, setState] = useState<State>("idle");
  const [entry, setEntry] = useState<OfflineCalendar | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  // React runs effects twice in development; without this the page would ask
  // the server for the same delta twice on every open.
  const synced = useRef(false);

  const sync = useCallback(async () => {
    setMessage(null);
    setState("saving");
    try {
      setEntry(await syncCalendarOffline());
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't save the calendar.");
    }
  }, []);

  useEffect(() => {
    if (!offlineCalendarSupported()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const saved = readOfflineCalendar();
    if (!saved) return;
    setEntry(saved);
    setState("done");
    if (synced.current) return;
    synced.current = true;
    void sync();
  }, [sync]);

  async function remove() {
    await removeCalendarOffline();
    setEntry(null);
    setState("idle");
  }

  if (!visible) return null;

  return (
    <div className="space-y-1 border-t border-sep pt-4">
      {entry ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 dark:border-green-900 dark:text-green-400">
            ✓ On this device
          </span>
          <button
            onClick={sync}
            disabled={state === "saving"}
            className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover disabled:opacity-60"
          >
            {state === "saving" ? "Updating…" : "Update now"}
          </button>
          <button
            onClick={remove}
            className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={sync}
          disabled={state === "saving"}
          className="rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Keep the calendar on this device"}
        </button>
      )}

      <p className="text-xs text-sec">
        {entry
          ? `${entry.eventCount} ${entry.eventCount === 1 ? "date" : "dates"} on this device, kept up to date whenever you open this page with a connection.`
          : "A year of rotas is a few kilobytes. Saved, it opens with no signal at all."}
      </p>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
