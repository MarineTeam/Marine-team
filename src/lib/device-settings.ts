/**
 * Per-device preferences, kept in localStorage rather than on the User row.
 *
 * Deliberately not synced to the account: theme follows the screen you're
 * looking at, and "download over cellular" is about the connection this
 * device is on — the same member wants different answers on their phone and
 * on the sanctuary's shared display. That also means these work while logged
 * out, unlike the account settings on the profile page.
 */

export type ThemePreference = "system" | "light" | "dark";

/**
 * "bunny" is Bunny's own iframe embed — adaptive quality, captions, native
 * controls, but no postMessage API so nothing outside it can drive playback.
 * "direct" is a plain `<video>` this app owns, playing the same signed MP4
 * the Downloads plugin already builds — a single fixed resolution instead
 * of adaptive quality, but real play/pause/seek and working Media Session
 * lock-screen controls. Only offered per-video when that MP4 exists; see
 * PlayerSwitcher.
 */
export type PlayerPreference = "bunny" | "direct";

/** Speeds offered in the settings UI; the stored value is validated against these. */
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Only English ships today. The setting is stored (and shown, disabled) so
 * the preference has a home before the strings are translated.
 */
export const LANGUAGES = [{ code: "en", label: "English" }] as const;

export type DeviceSettings = {
  theme: ThemePreference;
  language: string;
  /** Whether a video starts playing on load, and whether "Up next" rolls into the following episode. */
  autoplay: boolean;
  defaultPlaybackSpeed: number;
  /** False (the default) keeps downloads to Wi-Fi, so nobody burns their data plan by surprise. */
  downloadOverCellular: boolean;
  /** Which player a video page opens with, when the direct player is available for that video at all. */
  preferredPlayer: PlayerPreference;
};

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  theme: "system",
  language: "en",
  autoplay: false,
  defaultPlaybackSpeed: 1,
  downloadOverCellular: false,
  preferredPlayer: "bunny",
};

export const DEVICE_SETTINGS_KEY = "marine-device-settings";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const PLAYER_PREFERENCES: PlayerPreference[] = ["bunny", "direct"];

/**
 * Reads settings out of whatever is in storage, falling back per-field.
 *
 * Tolerant by design: this parses data a previous (or future) version of the
 * app wrote, so a missing key, a renamed theme, or outright junk falls back to
 * the default for that one field instead of throwing away the whole object.
 * Pure, so it can be unit-tested without a DOM.
 */
export function parseDeviceSettings(raw: string | null | undefined): DeviceSettings {
  if (!raw) return DEFAULT_DEVICE_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_DEVICE_SETTINGS;
  const value = parsed as Record<string, unknown>;

  return {
    theme: THEMES.includes(value.theme as ThemePreference)
      ? (value.theme as ThemePreference)
      : DEFAULT_DEVICE_SETTINGS.theme,
    language: LANGUAGES.some((l) => l.code === value.language)
      ? (value.language as string)
      : DEFAULT_DEVICE_SETTINGS.language,
    autoplay: typeof value.autoplay === "boolean" ? value.autoplay : DEFAULT_DEVICE_SETTINGS.autoplay,
    defaultPlaybackSpeed: (PLAYBACK_SPEEDS as readonly number[]).includes(value.defaultPlaybackSpeed as number)
      ? (value.defaultPlaybackSpeed as number)
      : DEFAULT_DEVICE_SETTINGS.defaultPlaybackSpeed,
    downloadOverCellular:
      typeof value.downloadOverCellular === "boolean"
        ? value.downloadOverCellular
        : DEFAULT_DEVICE_SETTINGS.downloadOverCellular,
    preferredPlayer: PLAYER_PREFERENCES.includes(value.preferredPlayer as PlayerPreference)
      ? (value.preferredPlayer as PlayerPreference)
      : DEFAULT_DEVICE_SETTINGS.preferredPlayer,
  };
}

/** Safe on the server and during the first render, where there's no localStorage yet. */
export function readDeviceSettings(): DeviceSettings {
  if (typeof window === "undefined") return DEFAULT_DEVICE_SETTINGS;
  try {
    return parseDeviceSettings(window.localStorage.getItem(DEVICE_SETTINGS_KEY));
  } catch {
    // Private-mode Safari throws on localStorage access rather than returning null.
    return DEFAULT_DEVICE_SETTINGS;
  }
}

/**
 * Merges a change into stored settings and returns the result. Fires a
 * `storage`-like custom event so anything else on the page (the theme, an
 * open player) picks the change up without a reload.
 */
export function writeDeviceSettings(change: Partial<DeviceSettings>): DeviceSettings {
  const next = { ...readDeviceSettings(), ...change };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Storage can be full or blocked; the in-memory result is still returned
      // so the UI reflects the choice for this session.
    }
    window.dispatchEvent(new CustomEvent(DEVICE_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

export const DEVICE_SETTINGS_EVENT = "marine-device-settings-change";

/** Resolves "system" against the OS preference and stamps the matching class on <html>. */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
}

/**
 * Runs before first paint from a blocking inline <script> in the document
 * head, so the page never flashes the wrong theme on load. Hand-written (not
 * derived from the functions above) because it has to be self-contained
 * string source with no imports — keep the storage key and class names in
 * step with applyTheme/parseDeviceSettings if either changes.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(DEVICE_SETTINGS_KEY)});
var theme=raw?(JSON.parse(raw)||{}).theme:"system";
if(theme!=="light"&&theme!=="dark")theme="system";
var dark=theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.add(dark?"dark":"light");
}catch(e){}})();`;
