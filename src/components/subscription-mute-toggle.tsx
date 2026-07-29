"use client";

import { useState } from "react";

export function SubscriptionMuteToggle({
  type,
  id,
  initialMuted,
}: {
  type: "series" | "category";
  id: string;
  initialMuted: boolean;
}) {
  const [muted, setMuted] = useState(initialMuted);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !muted;
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, muted: next }),
      });
      if (res.ok) setMuted(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={muted ? "Not receiving notifications for this" : "Receiving notifications for this"}
      className={`shrink-0 rounded-md border px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 ${
        muted ? "border-zinc-300 text-zinc-500" : "border-zinc-300"
      }`}
    >
      {muted ? "🔕 Muted" : "🔔 Notify"}
    </button>
  );
}
