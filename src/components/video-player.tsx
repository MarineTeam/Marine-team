"use client";

import { useEffect, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { readDeviceSettings } from "@/lib/device-settings";

type Chapter = { id: string; title: string; timestampSeconds: number };

/**
 * Jumping to a chapter re-points the iframe at a new `t=` start time rather
 * than seeking a live player: Bunny Stream's embed has no documented
 * postMessage API for that (see the Up next/watch progress notes), so this
 * reloads the iframe starting at the chapter's timestamp instead.
 */
function withStart(embedUrl: string, seconds: number): string {
  const url = new URL(embedUrl);
  url.searchParams.set("t", `${Math.floor(seconds)}s`);
  url.searchParams.set("autoplay", "true");
  return url.toString();
}

function withAutoplay(embedUrl: string): string {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "true");
  return url.toString();
}

export function VideoPlayer({ embedUrl, chapters }: { embedUrl: string; chapters: Chapter[] }) {
  const [src, setSrc] = useState(embedUrl);
  const [preferredSpeed, setPreferredSpeed] = useState(1);

  // Both settings are per-device, so they're only readable on the client —
  // hence an effect rather than props. Autoplay swaps the iframe src, which
  // reloads it; that's fine on mount, before anyone has pressed play.
  useEffect(() => {
    const settings = readDeviceSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferredSpeed(settings.defaultPlaybackSpeed);
    if (settings.autoplay) setSrc(withAutoplay(embedUrl));
  }, [embedUrl]);

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        <iframe
          src={src}
          className="h-full w-full"
          allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Bunny's embed takes no playback-rate parameter and exposes no
          postMessage API to set one, so the saved default can only be a
          reminder of which speed to pick in the player's own settings. */}
      {preferredSpeed !== 1 && (
        <p className="text-xs text-zinc-400">
          Your preferred speed is {preferredSpeed}× — set it with the player&apos;s ⚙️ settings icon.
        </p>
      )}

      {chapters.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSrc(withStart(embedUrl, c.timestampSeconds))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="w-16 shrink-0 tabular-nums text-zinc-500">
                  {formatTimestamp(c.timestampSeconds)}
                </span>
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
