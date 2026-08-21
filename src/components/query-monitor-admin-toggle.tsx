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
      className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
        enabled ? "" : "btn-primary text-white"
      }`}
    >
      {enabled ? "Disable" : "Enable"}
    </button>
  );
}
