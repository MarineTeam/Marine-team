"use client";

import { useState } from "react";

export function SubscribeButton({
  type,
  id,
  initialSubscribed,
}: {
  type: "series" | "category";
  id: string;
  initialSubscribed: boolean;
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubscribed(data.subscribed);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={subscribed}
      className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
        subscribed
          ? "border-blue-400 text-blue-700 dark:text-blue-400"
          : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {subscribed ? "✓ Subscribed" : "Subscribe"}
    </button>
  );
}
