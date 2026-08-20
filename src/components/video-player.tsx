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

// Roughly the smallest height Bunny's own on-screen controls (play/pause,
// seek bar, volume) stay usable at — audio-only mode shrinks to this rather
// than hiding the iframe outright, since there's no postMessage API to
// drive playback ourselves (see withStart below), so Bunny's built-in
// controls are the only way to pause/seek once the video is out of the way.
const AUDIO_ONLY_HEIGHT = 180;

export function VideoPlayer({
  embedUrl,
  chapters,
  title,
  artist,
  artworkUrl,
}: {
  embedUrl: string;
  chapters: Chapter[];
  /** For the lock-screen/notification "Now playing" info in audio-only mode. */
  title: string;
  artist?: string;
  artworkUrl?: string;
}) {
  const [src, setSrc] = useState(embedUrl);
  const [preferredSpeed, setPreferredSpeed] = useState(1);
  const [copiedChapterId, setCopiedChapterId] = useState<string | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);

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

  // Best-effort only: this sets what a lock-screen/notification "Now
  // playing" card shows (title, artist, artwork), but there are no action
  // handlers for play/pause/seek — wiring those would need control over the
  // iframe's actual <video> element, which the missing postMessage API
  // rules out (see withStart above). Browsers that show media controls for
  // audio playing in a background/cross-origin iframe at all will show
  // this info; ones that don't, won't — there's no way to detect which from here.
  useEffect(() => {
    if (!audioOnly || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: artist ?? "Marine Team",
      artwork: artworkUrl ? [{ src: artworkUrl }] : [],
    });
    return () => {
      navigator.mediaSession.metadata = null;
    };
  }, [audioOnly, title, artist, artworkUrl]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setAudioOnly((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {audioOnly ? "🎬 Show video" : "🎧 Audio only"}
        </button>
      </div>
      <div
        className={
          audioOnly
            ? "overflow-hidden rounded-lg bg-black"
            : "aspect-video overflow-hidden rounded-lg bg-black"
        }
        style={audioOnly ? { height: AUDIO_ONLY_HEIGHT } : undefined}
      >
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
            <li key={c.id} className="flex items-center">
              <button
                onClick={() => setSrc(withStart(embedUrl, c.timestampSeconds))}
                className="flex flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="w-16 shrink-0 tabular-nums text-zinc-500">
                  {formatTimestamp(c.timestampSeconds)}
                </span>
                <span>{c.title}</span>
              </button>
              <button
                onClick={() => copyChapterLink(c.id, c.timestampSeconds)}
                title="Copy link to this chapter"
                className="shrink-0 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
