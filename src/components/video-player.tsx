"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { readDeviceSettings } from "@/lib/device-settings";

type Chapter = { id: string; title: string; timestampSeconds: number };

/**
 * Bunny Stream does support postMessage control of its embed — via
 * Player.js (https://bunny.net/blog/introducing-player-js-support-for-bunny-stream-...),
 * loaded from Bunny's own CDN. That's used below only to fight an
 * Android-only auto-pause on backgrounding; chapter-jumping still reloads
 * the iframe with a new `t=` rather than calling Player.js's seek(), to
 * keep that already-working behavior unchanged.
 */
declare global {
  interface Window {
    playerjs?: { Player: new (elementOrId: HTMLIFrameElement | string) => PlayerJsInstance };
  }
}

interface PlayerJsInstance {
  on(event: "play" | "pause", callback: () => void): void;
  play(): void;
}

const PLAYERJS_SCRIPT_URL = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";
let playerjsScriptRequested = false;

/**
 * Jumping to a chapter re-points the iframe at a new `t=` start time rather
 * than seeking a live player: this reloads the iframe starting at the
 * chapter's timestamp instead of calling Player.js's seek() (see above).
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
  const iframeId = useId();
  const wasPlayingRef = useRef(false);
  const backgroundResumeAttemptedRef = useRef(false);

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

  // Experimental, unverified against a real device: Android appears to
  // auto-pause the embed when the app is minimized (reported behavior, not
  // something Bunny documents a way to disable). This fights that by
  // calling Player.js's play() again the moment an unexpected pause is
  // seen while the page is hidden — but only once per background period,
  // to avoid a retry loop if the browser itself is what's blocking
  // playback rather than the player pausing on its own. A pause seen while
  // the page is visible is a real tap and is never overridden.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onVisibilityChange() {
      if (!document.hidden) backgroundResumeAttemptedRef.current = false;
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    let cancelled = false;
    function attach() {
      if (cancelled || !window.playerjs) return;
      const player = new window.playerjs.Player(iframeId);
      player.on("play", () => {
        wasPlayingRef.current = true;
      });
      player.on("pause", () => {
        const wasPlaying = wasPlayingRef.current;
        wasPlayingRef.current = false;
        if (document.hidden && wasPlaying && !backgroundResumeAttemptedRef.current) {
          backgroundResumeAttemptedRef.current = true;
          player.play();
        }
      });
    }

    let pollInterval: ReturnType<typeof setInterval> | undefined;
    if (window.playerjs) {
      attach();
    } else {
      if (!playerjsScriptRequested) {
        playerjsScriptRequested = true;
        const script = document.createElement("script");
        script.src = PLAYERJS_SCRIPT_URL;
        script.async = true;
        document.head.appendChild(script);
      }
      pollInterval = setInterval(() => {
        if (window.playerjs) {
          clearInterval(pollInterval);
          attach();
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [iframeId]);

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        <iframe
          id={iframeId}
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
