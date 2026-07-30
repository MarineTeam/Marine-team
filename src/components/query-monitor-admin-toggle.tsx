"use client";

import { useState } from "react";

export function QueryMonitorAdminToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/query-monitor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 ${
        enabled ? "" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
      }`}
    >
      {enabled ? "Disable" : "Enable"}
    </button>
  );
}
