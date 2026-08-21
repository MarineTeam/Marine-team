"use client";

import { useEffect, useState } from "react";

function format(ms: number): string {
  if (ms <= 0) return "starting now…";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`, `${seconds}s`);
  return parts.join(" ");
}

/**
 * Countdown to a scheduled premiere (or, via `label`, any other timestamped
 * event like a live stream); reloads the page once it hits zero so the real
 * player takes over.
 */
export function PremiereCountdown({ premiereAt, label = "Premieres in" }: { premiereAt: string; label?: string }) {
  const target = new Date(premiereAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const next = target - Date.now();
      setRemaining(next);
      if (next <= 0) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div className="aspect-video flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white">
      <p className="text-sm uppercase tracking-wide text-ter">{label}</p>
      <p className="font-mono text-2xl">{format(remaining)}</p>
      <p className="text-sm text-ter">{new Date(premiereAt).toLocaleString()}</p>
    </div>
  );
}
