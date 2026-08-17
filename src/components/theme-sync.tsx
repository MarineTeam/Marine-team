"use client";

import { useEffect } from "react";
import { applyTheme, DEVICE_SETTINGS_EVENT, readDeviceSettings } from "@/lib/device-settings";

/**
 * Keeps the theme class in step after first paint, which the inline
 * THEME_INIT_SCRIPT can't do on its own:
 *  - "System" has to follow the OS flipping to dark while the page is open.
 *  - A change made in another tab (or by the settings form) has to land here too.
 *
 * Renders nothing; it exists for the listeners.
 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = () => applyTheme(readDeviceSettings().theme);

    media.addEventListener("change", reapply);
    // `storage` fires for other tabs, the custom event for this one.
    window.addEventListener("storage", reapply);
    window.addEventListener(DEVICE_SETTINGS_EVENT, reapply);
    return () => {
      media.removeEventListener("change", reapply);
      window.removeEventListener("storage", reapply);
      window.removeEventListener(DEVICE_SETTINGS_EVENT, reapply);
    };
  }, []);

  return null;
}
