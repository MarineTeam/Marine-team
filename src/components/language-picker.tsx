"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";

/**
 * Choosing a language.
 *
 * Writes it twice on purpose: a cookie, which is the only form the server can
 * read while rendering, and the device settings, so it travels with the theme
 * and the rest of what this device has chosen. Then reloads the route so the
 * server renders it again in the new language rather than leaving half the
 * page behind.
 */
export function LanguagePicker({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(current);
  const [busy, setBusy] = useState(false);

  async function choose(next: Locale) {
    setLocale(next);
    setBusy(true);
    try {
      writeDeviceSettings({ language: next });
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (LOCALES.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-sec">{label}</span>
      <select
        value={locale}
        disabled={busy}
        onChange={(e) => choose(e.target.value as Locale)}
        className="rounded-md border border-sep px-2 py-1.5 disabled:opacity-60"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Reads back what this device chose, for a page that renders on the client. */
export function deviceLocale(): string {
  return readDeviceSettings().language;
}
