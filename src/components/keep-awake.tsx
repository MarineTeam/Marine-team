"use client";

import { useEffect } from "react";
import { DEVICE_SETTINGS_EVENT, readDeviceSettings } from "@/lib/device-settings";

/**
 * Holds the screen on while a book or a hymn is open.
 *
 * A phone dimming halfway through the second verse is the most ordinary
 * failure this app has, and the one nobody can do anything about while
 * holding it and singing. The Wake Lock API is the fix, with two properties
 * worth knowing: the browser drops the lock whenever the page is hidden — so
 * it is re-taken on the way back rather than assumed to have survived — and
 * it is released the moment this unmounts, which is to say the moment the
 * reader is closed. Nothing keeps a screen on in the background.
 *
 * Per device, like the settings it sits with, and quietly absent where the
 * API isn't (Safari before 16.4, Firefox): there is nothing to say about it
 * and nothing to fall back to.
 */
type WakeLock = { release: () => Promise<void>; released: boolean };

export function KeepAwake() {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } })
      .wakeLock;
    if (!api) return;

    let lock: WakeLock | null = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || lock || !readDeviceSettings().keepScreenAwake) return;
      try {
        lock = await api!.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Denied (a background tab, a battery-saver mode). Reading works; the
        // screen just behaves as it normally would.
      }
    }

    async function release() {
      const held = lock;
      lock = null;
      try {
        if (held && !held.released) await held.release();
      } catch {
        // Already gone.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
      else lock = null; // The browser has already dropped it.
    }

    function onSettingsChange() {
      if (readDeviceSettings().keepScreenAwake) void acquire();
      else void release();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(DEVICE_SETTINGS_EVENT, onSettingsChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(DEVICE_SETTINGS_EVENT, onSettingsChange);
      void release();
    };
  }, []);

  return null;
}
