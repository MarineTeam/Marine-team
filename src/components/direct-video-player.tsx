"use client";

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { readDeviceSettings } from "@/lib/device-settings";

type Chapter = { id: string; title: string; timestampSeconds: number };

const MEDIA_SESSION_ACTIONS = ["play", "pause", "seekbackward", "seekforward", "seekto"] as const;

/**
 * Plays a real `<video>` element this app owns, against the same signed MP4
 * URL already built for the Downloads plugin (/api/downloads/[videoId]) —
 * fixed at whatever single resolution Bunny has at or under
 * BUNNY_STREAM_DOWNLOAD_HEIGHT, rather than Bunny's adaptive quality. The
 * trade for that fixed resolution: real play/pause/seek and working Media
 * Session lock-screen controls, neither possible with Bunny's iframe embed
 * (see video-player.tsx) — and, unlike that embed, audio-only mode here has
 * fully working controls, since there's an actual media element to drive.
 *
 * Whether this survives the screen locking or the app backgrounding still
 * isn't guaranteed — that's down to the browser/OS's own policy for a
 * playing <video>, not something this app can force — but it has a real
 * chance, which a cross-origin iframe never did.
 */
export function DirectVideoPlayer({
  videoId,
  chapters,
  title,
  artist,
  artworkUrl,
  startSeconds,
}: {
  videoId: string;
  chapters: Chapter[];
  title: string;
  artist?: string;
  artworkUrl?: string;
  startSeconds: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startSeconds);
  const [duration, setDuration] = useState(0);
  const [copiedChapterId, setCopiedChapterId] = useState<string | null>(null);
  // Device-setting-driven, like Bunny's embed (withAutoplay) — independent
  // of startSeconds, which only seeds where playback begins, not whether it
  // starts on its own.
  const [autoplayPreferred, setAutoplayPreferred] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoplayPreferred(readDeviceSettings().autoplay);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/downloads/${videoId}?platform=web`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data.url !== "string" || !data.url) {
          throw new Error(data.error ?? "This video isn't available in the direct player right now.");
        }
        if (!cancelled) setSrc(data.url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this video.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Unlike Bunny's embed (which takes no playback-rate parameter at all),
  // this is a real <video> element, so the saved default actually applies.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = readDeviceSettings().defaultPlaybackSpeed;
  }, [src]);

  // Real action handlers this time — this app owns the <video> element, so
  // lock-screen/notification play/pause/seek buttons can actually do
  // something, unlike the best-effort metadata-only version for Bunny's embed.
  useEffect(() => {
    const video = videoRef.current;
    if (!src || !video || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: artist ?? "Marine Team",
      artwork: artworkUrl ? [{ src: artworkUrl }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => void video.play());
    navigator.mediaSession.setActionHandler("pause", () => video.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      video.currentTime = Math.max(0, video.currentTime - (details.seekOffset ?? 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (details.seekOffset ?? 10));
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) video.currentTime = details.seekTime;
    });

    return () => {
      navigator.mediaSession.metadata = null;
      for (const action of MEDIA_SESSION_ACTIONS) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Not every browser recognizes every action name; ignore.
        }
      }
    };
  }, [src, title, artist, artworkUrl]);

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    if (video.paused) void video.play();
  }

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

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

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

      {/*
        Shrunk to a small mini-player strip rather than hidden outright when
        audio-only — same reasoning as the Bunny embed (video-player.tsx):
        clipping this down to ~invisible risks the browser suspending
        background playback, the same thing that happens to a backgrounded
        tab generally, just triggered here by the element's own size/
        visibility rather than the tab's. A real, modestly-sized element
        avoids that risk, at the cost of not being fully "hidden."
      */}
      <div className={audioOnly ? "flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" : undefined}>
        <div
          className={audioOnly ? "w-24 shrink-0 overflow-hidden rounded bg-black" : "aspect-video overflow-hidden rounded-lg bg-black"}
          style={audioOnly ? { aspectRatio: "16 / 9" } : undefined}
        >
          {src ? (
            <video
              ref={videoRef}
              src={src}
              controls={!audioOnly}
              playsInline
              autoPlay={autoplayPreferred}
              className="h-full w-full"
              onLoadedMetadata={(e) => {
                if (startSeconds > 0) e.currentTarget.currentTime = startSeconds;
                setDuration(e.currentTarget.duration || 0);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">Loading…</div>
          )}
        </div>
        {audioOnly && src && (
          <div className="flex-1 text-sm">
            <p className="font-medium">{title}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (playing ? videoRef.current?.pause() : void videoRef.current?.play())}
                className="shrink-0 rounded-full border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {playing ? "⏸" : "▶️"}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <p className="text-xs tabular-nums text-zinc-500">
              {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </p>
          </div>
        )}
      </div>

      {chapters.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {chapters.map((c) => (
            <li key={c.id} className="flex items-center">
              <button
                onClick={() => seekTo(c.timestampSeconds)}
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
