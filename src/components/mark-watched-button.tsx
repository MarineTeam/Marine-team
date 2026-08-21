"use client";

import { useState } from "react";

/** Lets a viewer explicitly mark (or unmark) a video as watched, independent of the heartbeat-based approximation. */
export function MarkWatchedButton({ videoId, initialCompleted }: { videoId: string; initialCompleted: boolean }) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch("/api/watch-progress/mark-watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, completed: !completed }),
      });
      if (res.ok) setCompleted(!completed);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={completed}
      className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
        completed
          ? "border-green-400 text-green-700 dark:text-green-400"
          : "border-sep hover:bg-hover"
      }`}
    >
      {completed ? "✓ Watched" : "Mark as watched"}
    </button>
  );
}
