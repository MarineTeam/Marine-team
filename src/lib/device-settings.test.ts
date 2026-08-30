import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVICE_SETTINGS,
  DEVICE_SETTINGS_KEY,
  parseDeviceSettings,
  THEME_INIT_SCRIPT,
} from "./device-settings";

describe("parseDeviceSettings", () => {
  it("falls back to the defaults for missing or unparseable storage", () => {
    expect(parseDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("")).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("{not json")).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("[]")).toEqual({ ...DEFAULT_DEVICE_SETTINGS });
    expect(parseDeviceSettings("null")).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it("reads a full, valid settings object back", () => {
    const stored = {
      theme: "dark",
      language: "en",
      autoplay: true,
      defaultPlaybackSpeed: 1.5,
      downloadOverCellular: true,
      swipeToTurnPages: false,
      keepScreenAwake: false,
      tabHrefs: ["/", "/categories/hymnals"],
    };
    expect(parseDeviceSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it("keeps the fields it recognizes when others are missing", () => {
    const settings = parseDeviceSettings(JSON.stringify({ theme: "light" }));
    expect(settings.theme).toBe("light");
    expect(settings.autoplay).toBe(DEFAULT_DEVICE_SETTINGS.autoplay);
    expect(settings.defaultPlaybackSpeed).toBe(DEFAULT_DEVICE_SETTINGS.defaultPlaybackSpeed);
  });

  it("rejects a theme or language it doesn't know, per field", () => {
    const settings = parseDeviceSettings(JSON.stringify({ theme: "sepia", language: "fr", autoplay: true }));
    expect(settings.theme).toBe("system");
    expect(settings.language).toBe("en");
    // The one good field survives the two bad ones.
    expect(settings.autoplay).toBe(true);
  });

  it("rejects a playback speed that isn't one we offer", () => {
    expect(parseDeviceSettings(JSON.stringify({ defaultPlaybackSpeed: 3 })).defaultPlaybackSpeed).toBe(1);
    expect(parseDeviceSettings(JSON.stringify({ defaultPlaybackSpeed: "1.5" })).defaultPlaybackSpeed).toBe(1);
    expect(parseDeviceSettings(JSON.stringify({ defaultPlaybackSpeed: 1.75 })).defaultPlaybackSpeed).toBe(1.75);
  });

  it("rejects non-boolean flags rather than coercing them", () => {
    const settings = parseDeviceSettings(JSON.stringify({ autoplay: "yes", downloadOverCellular: 1 }));
    expect(settings.autoplay).toBe(false);
    expect(settings.downloadOverCellular).toBe(false);
  });

  it("holds the screen on unless it was deliberately turned off", () => {
    expect(parseDeviceSettings("{}").keepScreenAwake).toBe(true);
    expect(parseDeviceSettings(JSON.stringify({ keepScreenAwake: 1 })).keepScreenAwake).toBe(true);
    expect(parseDeviceSettings(JSON.stringify({ keepScreenAwake: false })).keepScreenAwake).toBe(false);
  });

  it("treats a bottom bar that was never customised as unset", () => {
    // Null means "use the app's suggestion", which is not the same as an
    // empty bar — see lib/nav-tabs.ts.
    expect(parseDeviceSettings("{}").tabHrefs).toBeNull();
    expect(parseDeviceSettings(JSON.stringify({ tabHrefs: "/" })).tabHrefs).toBeNull();
    expect(parseDeviceSettings(JSON.stringify({ tabHrefs: ["/", "/search"] })).tabHrefs).toEqual([
      "/",
      "/search",
    ]);
  });

  it("keeps page swiping on unless it was deliberately turned off", () => {
    expect(parseDeviceSettings("{}").swipeToTurnPages).toBe(true);
    expect(parseDeviceSettings(JSON.stringify({ swipeToTurnPages: "no" })).swipeToTurnPages).toBe(true);
    expect(parseDeviceSettings(JSON.stringify({ swipeToTurnPages: false })).swipeToTurnPages).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // The script is hand-written string source rather than a compiled copy of
  // applyTheme, so these guard the two things that would silently break the
  // no-flash theme: reading a different key, or setting a different class.
  it("reads the same storage key parseDeviceSettings writes", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(DEVICE_SETTINGS_KEY));
  });

  it("stamps one of the two classes the stylesheet keys off", () => {
    expect(THEME_INIT_SCRIPT).toContain('classList.add(dark?"dark":"light")');
  });

  it("swallows its own errors, so a blocked localStorage can't halt the page", () => {
    expect(THEME_INIT_SCRIPT).toContain("catch(e){}");
  });
});
