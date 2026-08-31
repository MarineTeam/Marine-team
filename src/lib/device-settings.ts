/**
 * Per-device preferences, kept in localStorage rather than on the User row.
 *
 * Deliberately not synced to the account: theme follows the screen you're
 * looking at, and "download over cellular" is about the connection this
 * device is on — the same member wants different answers on their phone and
 * on the sanctuary's shared display. That also means these work while logged
 * out, unlike the account settings on the profile page.
 */

import { parseTabHrefs } from "@/lib/nav-tabs";

export type ThemePreference = "system" | "light" | "dark";

/** How far present mode's type can be nudged either way (see presentTextScale). */
export const MIN_PRESENT_SCALE = 0.5;
export const MAX_PRESENT_SCALE = 2.5;

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
  /**
   * Whether a horizontal swipe (or the arrow keys) turns the page in the PDF
   * reader. On by default — it is how a book behaves on a phone — but it is a
   * setting because a swipe is also how some people scroll, and because a
   * pen or a trackpad can produce one by accident.
   */
  swipeToTurnPages: boolean;
  /**
   * Whether the screen is held on while a book or a hymn is open. On by
   * default: a phone dimming mid-verse is what this exists to stop, and the
   * lock is dropped the moment the page is hidden or the reader closed.
   */
  keepScreenAwake: boolean;
  /**
   * How big the words are in present mode, as a multiplier on what fits the
   * screen. Per device because it belongs to the screen: the projector in the
   * hall and the phone in your hand want different answers.
   */
  presentTextScale: number;
  /** Present mode's own palette — light on dark carries further in a dark room. */
  presentTheme: "dark" | "light";
  /**
   * Which icons the bottom bar carries, as hrefs, in order — see
   * lib/nav-tabs.ts. Null means the app's own suggestion, which is what
   * every device starts with.
   */
  tabHrefs: string[] | null;
};

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  theme: "system",
  language: "en",
  autoplay: false,
  defaultPlaybackSpeed: 1,
  downloadOverCellular: false,
  swipeToTurnPages: true,
  keepScreenAwake: true,
  presentTextScale: 1,
  presentTheme: "dark",
  tabHrefs: null,
};

export const DEVICE_SETTINGS_KEY = "marine-device-settings";

const THEMES: ThemePreference[] = ["system", "light", "dark"];

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
    swipeToTurnPages:
      typeof value.swipeToTurnPages === "boolean"
        ? value.swipeToTurnPages
        : DEFAULT_DEVICE_SETTINGS.swipeToTurnPages,
    keepScreenAwake:
      typeof value.keepScreenAwake === "boolean"
        ? value.keepScreenAwake
        : DEFAULT_DEVICE_SETTINGS.keepScreenAwake,
    // Clamped rather than rejected: this is nudged by a button, and a stored
    // value slightly outside the range should land back inside it, not reset
    // to the default in the middle of a service.
    presentTextScale:
      typeof value.presentTextScale === "number" && Number.isFinite(value.presentTextScale)
        ? Math.min(MAX_PRESENT_SCALE, Math.max(MIN_PRESENT_SCALE, value.presentTextScale))
        : DEFAULT_DEVICE_SETTINGS.presentTextScale,
    presentTheme: value.presentTheme === "light" ? "light" : DEFAULT_DEVICE_SETTINGS.presentTheme,
    tabHrefs: parseTabHrefs(value.tabHrefs),
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
