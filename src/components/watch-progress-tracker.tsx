"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_SECONDS = 15;

/**
 * Sends a periodic heartbeat while a video page is open, approximating watch
 * progress as elapsed time since the page loaded (offset by any previously
 * saved position). Used to power "Continue watching" and resume-on-return.
 */
export function WatchProgressTracker({
  videoId,
  startPositionSeconds,
  durationSeconds,
}: {
  videoId: string;
  startPositionSeconds: number;
  durationSeconds: number | null;
}) {
  const elapsedRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      elapsedRef.current += HEARTBEAT_SECONDS;
      const position = startPositionSeconds + elapsedRef.current;
      const completed = durationSeconds != null && position >= durationSeconds - 5;
      navigator.sendBeacon?.(
        "/api/watch-progress",
        new Blob(
          [JSON.stringify({ videoId, positionSeconds: Math.round(position), completed })],
          { type: "application/json" },
        ),
      );
      if (completed) clearInterval(interval);
    }, HEARTBEAT_SECONDS * 1000);

    return () => clearInterval(interval);
  }, [videoId, startPositionSeconds, durationSeconds]);

  return null;
}
