"use client";

import { useCallback, useEffect, useState } from "react";
import { readDeviceSettings } from "@/lib/device-settings";
import { isPlatformAllowed } from "@/lib/download-platform";
import {
  currentPlatform,
  downloadVideo,
  downloadsSupported,
  isDownloaded,
  isLikelyCellular,
  removeDownload,
} from "@/lib/offline-downloads";

type State = "idle" | "checking" | "downloading" | "done" | "error";

/**
 * Downloads this video to the device for offline viewing.
 *
 * The server decides *whether* (see /api/downloads/[videoId]) — this only
 * asks, reports the refusal it gets back, and does the storing. The one rule
 * it enforces on its own is the member's Wi-Fi-only preference, which is a
 * per-device setting the server has no view of.
 */
export function DownloadButton({
  videoId,
  title,
  seriesTitle,
  videoSlug,
  durationSeconds,
  policyPlatform,
}: {
  videoId: string;
  title: string;
  seriesTitle: string | null;
  videoSlug: string;
  durationSeconds: number | null;
  /** Where the site allows downloading; compared against what this client actually is. */
  policyPlatform: "WEB" | "PWA" | "BOTH";
}) {
  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Both halves of this are client-only facts: whether Cache Storage exists,
    // and whether we're the installed app. Hidden until they're known rather
    // than flashed and withdrawn, hence the false default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(downloadsSupported() && isPlatformAllowed(policyPlatform, currentPlatform()));
    if (isDownloaded(videoId)) setState("done");
  }, [videoId, policyPlatform]);

  const start = useCallback(async () => {
    setMessage(null);

    const settings = readDeviceSettings();
    if (!settings.downloadOverCellular && isLikelyCellular()) {
      setMessage("You're on mobile data. Allow downloads over data in your profile settings, or wait for Wi-Fi.");
      return;
    }

    setState("checking");
    try {
      const res = await fetch(`/api/downloads/${videoId}?platform=${currentPlatform()}`);
      // A gateway or an offline tab can answer with something that isn't JSON;
      // showing "Unexpected token <" to a member helps nobody.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ?? "We couldn't prepare the download. Check your connection and try again.",
        );
      }
      if (typeof data.url !== "string" || !data.url) {
        throw new Error("We couldn't prepare the download. Please try again.");
      }

      setState("downloading");
      setProgress(0);
      await downloadVideo(
        { videoId, title, seriesTitle, videoSlug, durationSeconds },
        data.url,
        (fraction) => setProgress(fraction),
      );
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't download this video");
    }
  }, [videoId, title, seriesTitle, videoSlug, durationSeconds]);

  async function remove() {
    await removeDownload(videoId);
    setState("idle");
    setProgress(0);
  }

  if (!visible) return null;

  return (
    <div className="space-y-1">
      {state === "done" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 dark:border-green-900 dark:text-green-400">
            ✓ Available offline
          </span>
          <button
            onClick={remove}
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={start}
          disabled={state === "checking" || state === "downloading"}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {state === "checking"
            ? "Preparing…"
            : state === "downloading"
              ? `Downloading… ${Math.round(progress * 100)}%`
              : "⬇ Download"}
        </button>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
      {state === "downloading" && (
        <div className="h-1 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
