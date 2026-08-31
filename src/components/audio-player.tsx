"use client";

import { useEffect, useRef, useState } from "react";
import { PLAYBACK_SPEEDS, readDeviceSettings } from "@/lib/device-settings";

/** How far the lock-screen skip buttons jump. Asymmetric on purpose: back to catch what you missed, forward past an ad-break-sized gap. */
const BACK_SECONDS = 15;
const FORWARD_SECONDS = 30;

/** Sleep-timer choices, in minutes. */
const SLEEP_MINUTES = [15, 30, 45, 60] as const;

/**
 * A sermon or a hymn, played with the controls a phone expects.
 *
 * A bare `<audio controls>` plays fine and then vanishes the moment the phone
 * locks: no title on the lock screen, no artwork, nothing to press without
 * unlocking and finding the tab again. The Media Session API is what puts it
 * there, and it is only a few lines — the reason it hadn't been done is that
 * the *video* player is inside Bunny's iframe where this isn't reachable.
 * Audio is our own element, so here it is reachable.
 *
 * It also finally applies the **default playback speed** from
 * `/profile/settings`, which until now was stored and shown as a reminder
 * because Bunny's embed takes no such parameter. That reason never applied to
 * audio.
 */
export function AudioPlayer({
  src,
  title,
  artist,
  artworkUrl,
}: {
  src: string;
  title: string;
  /** The series or section it belongs to — the second line on a lock screen. */
  artist: string | null;
  artworkUrl?: string | null;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  /** When the sleep timer will fire, for the line that says so. */
  const [sleepAt, setSleepAt] = useState<number | null>(null);

  // The stored preference, applied for real. Read after mounting because it
  // lives in this device's localStorage, which the server can't see.
  useEffect(() => {
    const stored = readDeviceSettings().defaultPlaybackSpeed;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeed(stored);
    if (ref.current) ref.current.playbackRate = stored;
  }, []);

  /**
   * The lock screen's copy of what is playing.
   *
   * Registered on play rather than on mount: a page listing eight talks would
   * otherwise have eight players each claiming the lock screen, and the last
   * one rendered would win rather than the one somebody pressed.
   */
  function claimMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const audio = ref.current;
    if (!audio) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: artist ?? "",
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: "512x512", type: "image/jpeg" }] : undefined,
    });

    navigator.mediaSession.setActionHandler("play", () => void audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      audio.currentTime = Math.max(0, audio.currentTime - BACK_SECONDS);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + FORWARD_SECONDS);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
    });
  }

  /**
   * Keeps the lock screen's scrubber honest.
   *
   * Without this the position bar sits at zero however long the talk has been
   * playing, which looks broken in exactly the place nobody can correct it.
   */
  function reportPosition() {
    const audio = ref.current;
    if (!audio || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!Number.isFinite(audio.duration)) return;
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  }

  // The sleep timer: a wall-clock deadline rather than a countdown of played
  // seconds, so pausing to answer the door doesn't extend the night.
  useEffect(() => {
    if (sleepAt === null) return;
    const remaining = sleepAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      ref.current?.pause();
      setSleepAt(null);
      setSleepMinutes(0);
    }, remaining);
    return () => clearTimeout(timer);
  }, [sleepAt]);

  return (
    <div className="space-y-2">
      <audio
        ref={ref}
        controls
        src={src}
        preload="metadata"
        className="w-full"
        onPlay={claimMediaSession}
        onLoadedMetadata={reportPosition}
        onTimeUpdate={reportPosition}
        onRateChange={reportPosition}
      >
        Your browser does not support the audio element.
      </audio>

      <div className="flex flex-wrap items-center gap-3 text-xs text-sec">
        <label className="flex items-center gap-1.5">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSpeed(next);
              if (ref.current) ref.current.playbackRate = next;
            }}
            className="rounded border border-sep bg-transparent px-1.5 py-1"
          >
            {PLAYBACK_SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span>Sleep</span>
          <select
            value={sleepMinutes}
            onChange={(e) => {
              const minutes = Number(e.target.value);
              setSleepMinutes(minutes);
              setSleepAt(minutes > 0 ? Date.now() + minutes * 60_000 : null);
            }}
            className="rounded border border-sep bg-transparent px-1.5 py-1"
          >
            <option value={0}>Off</option>
            {SLEEP_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>

        {sleepAt !== null && (
          <span>
            Stops at{" "}
            {new Date(sleepAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
