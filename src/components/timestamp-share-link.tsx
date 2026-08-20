"use client";

import { useState } from "react";
import { parseTimestamp } from "@/lib/format";

/**
 * Copies a link back to this video at a chosen mm:ss mark (?t=<seconds>,
 * read by the video page to seed the player's start time). Manual entry
 * rather than "share from here": Bunny's embed exposes no postMessage API
 * to read the iframe's live playback position (see video-player.tsx), so
 * there's no current time to grab automatically.
 */
export function TimestampShareLink({ path }: { path: string }) {
  const [value, setValue] = useState("0:00");
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const seconds = parseTimestamp(value);
    if (seconds == null) return;
    const url = `${window.location.origin}${path}?t=${Math.floor(seconds)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); silently ignore.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="clip-timestamp" className="text-zinc-500">
        Share at
      </label>
      <input
        id="clip-timestamp"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0:00"
        inputMode="numeric"
        className="w-20 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        onClick={copyLink}
        className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {copied ? "Copied!" : "Copy timestamped link"}
      </button>
    </div>
  );
}
