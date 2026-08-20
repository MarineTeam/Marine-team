"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";

/**
 * Shows the next video in the series with an autoplay toggle. Bunny's embed
 * does support postMessage control via Player.js (see video-player.tsx),
 * including an "ended" event — not wired up here yet, so autoplay stays a
 * best-effort timer keyed off the video's known duration rather than that
 * real end event.
 *
 * The toggle is the same per-device autoplay setting as the one in
 * /profile/settings — flipping it here is a shortcut to that preference, not a
 * second switch that could disagree with it.
 */
export function UpNextPanel({
  href,
  title,
  thumbnailUrl,
  durationSeconds,
  resumeAtSeconds,
}: {
  href: string;
  title: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  resumeAtSeconds: number;
}) {
  const router = useRouter();
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoplay(readDeviceSettings().autoplay);
  }, []);

  useEffect(() => {
    if (!autoplay || !durationSeconds) return;
    const remainingMs = Math.max(0, durationSeconds - resumeAtSeconds) * 1000;
    const timer = setTimeout(() => router.push(href), remainingMs);
    return () => clearTimeout(timer);
  }, [autoplay, durationSeconds, resumeAtSeconds, href, router]);

  const counting = autoplay && Boolean(durationSeconds);

  function toggleAutoplay() {
    const next = !autoplay;
    setAutoplay(next);
    writeDeviceSettings({ autoplay: next });
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      {thumbnailUrl && (
        <Image
          src={thumbnailUrl}
          alt=""
          width={112}
          height={64}
          unoptimized
          className="h-16 w-28 shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Up next{counting ? " · playing soon…" : ""}
        </p>
        <a href={href} className="block truncate font-medium hover:underline">
          {title}
        </a>
      </div>
      <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
        <input type="checkbox" checked={autoplay} onChange={toggleAutoplay} />
        Autoplay
      </label>
    </div>
  );
}
