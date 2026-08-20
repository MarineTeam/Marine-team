"use client";

import { useEffect, useState } from "react";
import { VideoPlayer } from "@/components/video-player";
import { DirectVideoPlayer } from "@/components/direct-video-player";
import { readDeviceSettings, writeDeviceSettings, type PlayerPreference } from "@/lib/device-settings";

type Chapter = { id: string; title: string; timestampSeconds: number };

/**
 * Picks between Bunny's iframe embed and this app's own direct <video>
 * player (see direct-video-player.tsx for the trade-off between them). The
 * direct player is only offered when `directPlayerAvailable` — mirroring
 * the Download/Cast buttons' own gate, since all three hand out the same
 * signed MP4 — so there's no dead toggle for a video that doesn't have one.
 * The choice is remembered as a device preference, but only applied when
 * the direct player is actually available for this particular video.
 */
export function PlayerSwitcher({
  videoId,
  embedUrl,
  chapters,
  title,
  artist,
  artworkUrl,
  startSeconds,
  directPlayerAvailable,
}: {
  videoId: string;
  embedUrl: string;
  chapters: Chapter[];
  title: string;
  artist?: string;
  artworkUrl?: string;
  startSeconds: number;
  directPlayerAvailable: boolean;
}) {
  const [mode, setMode] = useState<PlayerPreference>("bunny");

  useEffect(() => {
    const preferred = readDeviceSettings().preferredPlayer;
    if (preferred === "direct" && directPlayerAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("direct");
    }
  }, [directPlayerAvailable]);

  function choose(next: PlayerPreference) {
    setMode(next);
    writeDeviceSettings({ preferredPlayer: next });
  }

  return (
    <div className="space-y-2">
      {directPlayerAvailable && (
        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Player">
          <button
            onClick={() => choose("bunny")}
            aria-pressed={mode === "bunny"}
            className={
              mode === "bunny"
                ? "rounded-md border border-zinc-900 px-2 py-1 dark:border-white"
                : "rounded-md border border-zinc-300 px-2 py-1 text-zinc-500 dark:border-zinc-700"
            }
          >
            Bunny player
          </button>
          <button
            onClick={() => choose("direct")}
            aria-pressed={mode === "direct"}
            className={
              mode === "direct"
                ? "rounded-md border border-zinc-900 px-2 py-1 dark:border-white"
                : "rounded-md border border-zinc-300 px-2 py-1 text-zinc-500 dark:border-zinc-700"
            }
          >
            Direct player
          </button>
        </div>
      )}
      {mode === "direct" && directPlayerAvailable ? (
        <DirectVideoPlayer
          videoId={videoId}
          chapters={chapters}
          title={title}
          artist={artist}
          artworkUrl={artworkUrl}
          startSeconds={startSeconds}
        />
      ) : (
        <>
          <VideoPlayer embedUrl={embedUrl} chapters={chapters} title={title} artist={artist} artworkUrl={artworkUrl} />
          <p className="text-xs text-zinc-400">
            Tip: use the player&apos;s ⚙️ settings icon to change playback speed.
          </p>
        </>
      )}
    </div>
  );
}
