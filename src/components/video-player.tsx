"use client";

import { useEffect, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { readDeviceSettings } from "@/lib/device-settings";

type Chapter = { id: string; title: string; timestampSeconds: number };

/**
 * Bunny Stream's embed does expose a postMessage API — Player.js
 * (play/pause/seek, plus play/pause/timeupdate/ended events), loaded from
 * Bunny's own CDN. Nothing here uses it yet.
 *
 * It was tried once, to fight Android pausing playback when the app is
 * minimized: listen for a pause while `document.hidden`, then call `play()`
 * again. That does not work — playback still stops. Most likely the browser
 * is refusing a `play()` that originates from a hidden document with no user
 * activation, which is exactly the case its autoplay policy blocks. It fails
 * invisibly, too: Player.js's `play()` is a fire-and-forget postMessage, so a
 * rejection inside the iframe never surfaces out here. Don't re-attempt this
 * from outside the iframe; see the Technical notes in FEATURES.md.
 */

/**
 * Jumping to a chapter re-points the iframe at a new `t=` start time rather
 * than seeking a live player. Player.js could seek instead, but reloading
 * already works, so it stays as-is.
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
  const [copiedChapterId, setCopiedChapterId] = useState<string | null>(null);

  async function copyChapterLink(id: string, seconds: number) {
    const url = `${window.location.origin}${window.location.pathname}?t=${Math.floor(seconds)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedChapterId(id);
      setTimeout(() => setCopiedChapterId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); silently ignore.
    }
  }

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

      {/* Bunny's embed takes no playback-rate parameter, and Player.js's
          documented methods don't cover setting one either, so the saved
          default can only be a reminder of which speed to pick in the
          player's own settings. */}
      {preferredSpeed !== 1 && (
        <p className="text-xs text-ter">
          Your preferred speed is {preferredSpeed}× — set it with the player&apos;s ⚙️ settings icon.
        </p>
      )}

      {chapters.length > 0 && (
        <ul className="divide-y divide-sep rounded-lg border border-sep text-sm">
          {chapters.map((c) => (
            <li key={c.id} className="flex items-center">
              <button
                onClick={() => setSrc(withStart(embedUrl, c.timestampSeconds))}
                className="flex flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-hover"
              >
                <span className="w-16 shrink-0 tabular-nums text-sec">
                  {formatTimestamp(c.timestampSeconds)}
                </span>
                <span>{c.title}</span>
              </button>
              <button
                onClick={() => copyChapterLink(c.id, c.timestampSeconds)}
                title="Copy link to this chapter"
                className="shrink-0 px-3 py-2 text-xs text-sec hover:text-ink"
              >
                {copiedChapterId === c.id ? "Copied!" : "🔗"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
