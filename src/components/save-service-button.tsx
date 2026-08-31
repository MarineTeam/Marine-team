"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkSavedService,
  isServiceSaved,
  offlineServicesSupported,
  readOfflineServices,
  removeServiceOffline,
  saveServiceOffline,
} from "@/lib/offline-services";

type State = "idle" | "saving" | "done" | "error";
type Status = "current" | "outdated" | "unavailable" | "unknown";

/**
 * Keeps a service's running order on this device.
 *
 * The smallest of the three save buttons and the one that matters most on
 * the day: a hall with no signal is exactly where somebody needs to know
 * which hymn is next, and the plan is two kilobytes against a hymnal's forty
 * megabytes. Saving it doesn't save the books — those have their own button,
 * on their own pages — so this says what it has and what it hasn't.
 *
 * Deliberately no cellular check, unlike the book and video buttons: nobody
 * needs warning before spending two kilobytes of their data.
 */
export function SaveServiceButton({ planId, hasBooks }: { planId: string; hasBooks: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>("unknown");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(offlineServicesSupported());
    if (!isServiceSaved(planId)) return;
    setState("done");
    const saved = readOfflineServices().find((item) => item.id === planId);
    // A running order gets reordered right up to Saturday night, so a copy
    // taken on Wednesday is the one thing somebody would read out unaware.
    if (saved) void checkSavedService(saved).then(setStatus);
  }, [planId]);

  const save = useCallback(async () => {
    setMessage(null);
    setState("saving");
    try {
      await saveServiceOffline(planId);
      setStatus("current");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't save this service.");
    }
  }, [planId]);

  async function remove() {
    await removeServiceOffline(planId);
    setStatus("unknown");
    setState("idle");
  }

  if (!visible) return null;

  return (
    <div className="no-print space-y-1">
      {state === "done" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 dark:border-green-900 dark:text-green-400">
            ✓ On this device
          </span>
          <button
            onClick={save}
            className={`rounded-md border px-3 py-1.5 ${
              status === "outdated" ? "btn-primary border-transparent text-white" : "border-sep hover:bg-hover"
            }`}
          >
            {status === "outdated" ? "Order changed — update" : "Update"}
          </button>
          <button onClick={remove} className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover">
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Keep this order offline"}
        </button>
      )}

      {state === "done" && (
        <p className="text-xs text-sec">
          {status === "outdated"
            ? "This order has changed since you saved it."
            : status === "unavailable"
              ? "This service is no longer published; your copy is still here."
              : hasBooks
                ? "The order is on this device. Save the books themselves from their own pages to open the hymns with no connection."
                : "The order is on this device."}
        </p>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
