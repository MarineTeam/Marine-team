"use client";

import { useEffect } from "react";

/** Registers the service worker so the site is installable and can receive Web Push. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration can fail (e.g. unsupported browser); the site still works without it.
      });
    }
  }, []);

  return null;
}
