"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_DEVICE_SETTINGS,
  LANGUAGES,
  PLAYBACK_SPEEDS,
  readDeviceSettings,
  writeDeviceSettings,
  type DeviceSettings,
  type ThemePreference,
} from "@/lib/device-settings";

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow this device's setting" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/**
 * The per-device settings. Every change saves immediately — there's no Save
 * button because nothing here round-trips to a server, so a confirmation step
 * would only add a click.
 *
 * Values are read in an effect rather than during render: they come from
 * localStorage, which the server doesn't have, and reading them in render
 * would make the markup mismatch on hydration.
 */
export function DeviceSettingsForm() {
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(readDeviceSettings());
    setReady(true);
  }, []);

  function update(change: Partial<DeviceSettings>) {
    const next = writeDeviceSettings(change);
    setSettings(next);
    if (change.theme) applyTheme(next.theme);
  }

  return (
    <div className="space-y-6" aria-busy={!ready}>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Appearance</h3>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Theme</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2">
              <input
                type="radio"
                name="theme"
                className="mt-1"
                checked={settings.theme === option.value}
                onChange={() => update({ theme: option.value })}
              />
              <span>
                {option.label}
                <span className="block text-xs text-sec">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="pt-2">
          <label htmlFor="language" className="block text-sm font-medium">
            Language
          </label>
          <select
            id="language"
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
            disabled={LANGUAGES.length === 1}
            className="mt-1 rounded-md border border-sep px-3 py-2 text-sm disabled:opacity-60"
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-sec">More languages are coming; English is the only one for now.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Playback</h3>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.autoplay}
            onChange={(e) => update({ autoplay: e.target.checked })}
          />
          <span>
            Autoplay
            <span className="block text-xs text-sec">
              Start playing as soon as a video page opens, and roll on to the next episode when one finishes.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="playback-speed" className="block text-sm font-medium">
            Default playback speed
          </label>
          <select
            id="playback-speed"
            value={settings.defaultPlaybackSpeed}
            onChange={(e) => update({ defaultPlaybackSpeed: Number(e.target.value) })}
            className="mt-1 rounded-md border border-sep px-3 py-2 text-sm"
          >
            {PLAYBACK_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×{speed === 1 ? " (normal)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-sec">
            Shown as a reminder under the player, which you set with its own ⚙️ control — the embedded Bunny player
            can&apos;t be started at a preset speed.
          </p>
        </div>
      </section>

      <p className="text-xs text-sec">
        These settings are stored on this device, so your phone and your computer can differ. Everything under
        Account below applies wherever you log in.
      </p>
    </div>
  );
}
