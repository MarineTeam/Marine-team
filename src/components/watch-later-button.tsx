"use client";

import { useState } from "react";

export function WatchLaterButton({
  type,
  id,
  initialQueued,
}: {
  type: "series" | "video";
  id: string;
  initialQueued: boolean;
}) {
  const [queued, setQueued] = useState(initialQueued);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch("/api/watch-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) {
        const data = await res.json();
        setQueued(data.queued);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={queued}
      className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
        queued
          ? "border-blue-400 text-blue-700 dark:text-blue-400"
          : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {queued ? "✓ Watch later" : "+ Watch later"}
    </button>
  );
}
