"use client";

import { useEffect } from "react";

/** Fire-and-forget: logs a ViewEvent once per browser per item (throttled server-side via cookie). */
export function ViewEventBeacon({ type, id }: { type: "series" | "video"; id: string }) {
  useEffect(() => {
    fetch("/api/view-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
      keepalive: true,
    }).catch(() => {});
  }, [type, id]);

  return null;
}
