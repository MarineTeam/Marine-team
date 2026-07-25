"use client";

import { useEffect, useState } from "react";

export function AnnouncementBanner({ id, message }: { id: string; message: string }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(sessionStorage.getItem(`announcement-dismissed:${id}`) === "1");
  }, [id]);

  function dismiss() {
    sessionStorage.setItem(`announcement-dismissed:${id}`, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950 dark:border-amber-900">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm text-amber-900 dark:text-amber-200">
        <p>{message}</p>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 hover:underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
