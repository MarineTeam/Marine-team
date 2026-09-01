import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOOK_CACHE, VIEWER_ASSETS, offlineBookUrl, offlineHymnalUrl } from "./offline-books";
import { DOWNLOAD_CACHE, downloadCacheUrl } from "./offline-downloads";
import { SERVICE_CACHE, offlineServiceUrl } from "./offline-services";
import { CALENDAR_CACHE, OFFLINE_CALENDAR_URL } from "./offline-calendar";
import { relativeDayLabel } from "./dates";
import {
  DEVICE_SETTINGS_KEY,
  MAX_READING_SCALE,
  MIN_READING_SCALE,
  READING_SCALE_STEP,
} from "./device-settings";
import { NAV_TABS_SNAPSHOT_KEY } from "./nav-tabs";
import { hymnNumberOf } from "./toc-nav";

/**
 * `public/offline.html` and `public/sw.js` are static files the service
 * worker serves with no bundle behind them, so everything they share with the
 * app — cache names, storage keys, URL prefixes, the icon set, the rule for
 * reading a hymn number — is copied into them by hand. That is the right
 * trade for files that have to stand alone, and it is exactly the kind of
 * duplication that rots silently: rename a key and nobody finds out until
 * somebody's offline screen is empty in a service.
 *
 * So this asserts the copies still match their originals. It fails on the
 * rename, in CI, rather than on the Sunday.
 */
const shell = readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

describe("the offline shell's copied constants", () => {
  it("opens the caches the app writes", () => {
    expect(shell).toContain(`"${DOWNLOAD_CACHE}"`);
    expect(shell).toContain(`"${BOOK_CACHE}"`);
    expect(shell).toContain(`"${SERVICE_CACHE}"`);
    expect(shell).toContain(`"${CALENDAR_CACHE}"`);
    expect(worker).toContain(`"${DOWNLOAD_CACHE}"`);
    expect(worker).toContain(`"${BOOK_CACHE}"`);
    expect(worker).toContain(`"${SERVICE_CACHE}"`);
    expect(worker).toContain(`"${CALENDAR_CACHE}"`);
  });

  it("reads the storage keys the app writes", () => {
    // The downloads and books indexes, the tab snapshot, the contents cache
    // and the theme — every localStorage key the shell touches.
    expect(shell).toContain('"marine-downloads-index"');
    expect(shell).toContain('"marine-offline-books"');
    expect(shell).toContain('"marine-offline-services"');
    expect(shell).toContain('"marine-offline-calendar"');
    expect(shell).toContain(`"${NAV_TABS_SNAPSHOT_KEY}"`);
    expect(shell).toContain('"marine-toc-v1:"');
    expect(shell).toContain(`"${DEVICE_SETTINGS_KEY}"`);
  });

  // The other setting the shell writes: whose calendar it is showing. A
  // rename here and the app and the offline screen quietly disagree about
  // who you are.
  it("stores the chosen name under the key the app reads", () => {
    expect(shell).toContain("calendarPersonId");
  });

  // The shell writes this setting as well as reading it, so its bounds have
  // to be the app's: a size stored outside them would come back to the app as
  // one nobody chose, and the app would clamp it to something else again.
  it("clamps the reading size to the same range the app does", () => {
    expect(shell).toContain(`const MIN_READING_SCALE = ${MIN_READING_SCALE};`);
    expect(shell).toContain(`const MAX_READING_SCALE = ${MAX_READING_SCALE};`);
    expect(shell).toContain(`const READING_SCALE_STEP = ${READING_SCALE_STEP};`);
  });

  it("answers for the paths saved media is stored under", () => {
    // Built from an id in the app, matched by prefix in the worker.
    expect(downloadCacheUrl("x")).toBe("/offline-video/x.mp4");
    expect(offlineBookUrl("x")).toBe("/offline-book/x.pdf");
    expect(offlineBookUrl("x", "epub")).toBe("/offline-book/x.epub");
    expect(offlineHymnalUrl("x")).toBe("/offline-hymnal/x.json");
    expect(offlineServiceUrl("x")).toBe("/offline-service/x.json");
    // The calendar is one file rather than one per thing saved, so the shell
    // reads the whole URL out of its index and only the worker matches a prefix.
    expect(OFFLINE_CALENDAR_URL.startsWith("/offline-calendar/")).toBe(true);
    expect(worker).toContain('"/offline-video/"');
    expect(worker).toContain('"/offline-book/"');
    expect(worker).toContain('"/offline-hymnal/"');
    expect(worker).toContain('"/offline-service/"');
    expect(worker).toContain('"/offline-calendar/"');
  });

  it("loads the reader libraries from where they are saved", () => {
    for (const asset of [...VIEWER_ASSETS.pdf, ...VIEWER_ASSETS.epub]) {
      expect(shell).toContain(`"${asset}"`);
    }
    // The worker serves those two directories cache-first.
    expect(worker).toContain('"/pdfjs/"');
    expect(worker).toContain('"/epubjs/"');
  });
});

describe("the offline shell's copied icon set", () => {
  it("can draw every icon a tab may carry", () => {
    // NavIcon is a union of string literals; the shell keeps a map of the
    // same names to the same SVG. A new icon in the app with no copy here
    // would draw a folder in the offline bar.
    const navIcons = [
      ...readFileSync(new URL("./nav.ts", import.meta.url), "utf8").matchAll(/^\s*\| "(\w+)"$/gm),
    ].map((match) => match[1]);
    const shellIcons = [...shell.matchAll(/^ {2}(\w+): '</gm)].map((match) => match[1]);

    expect(navIcons.length).toBeGreaterThan(5);
    expect(navIcons.filter((icon) => !shellIcons.includes(icon))).toEqual([]);
  });
});

describe("the offline shell's copy of hymnNumberOf", () => {
  /** The shell's own function, lifted out and run — behaviour, not text. */
  const copied = (() => {
    const source = shell.match(/function hymnNumberOf\(label\) \{[\s\S]*?\n\}/);
    if (!source) throw new Error("offline.html no longer defines hymnNumberOf");
    return new Function(`${source[0]}; return hymnNumberOf;`)() as (label: string) => number | null;
  })();

  it("reads a number exactly as the app does", () => {
    const labels = [
      "214",
      "1. Holy, Holy, Holy",
      "  12  Rock of Ages",
      "Hymn 45 — Praise",
      "No. 12 Rock of Ages",
      // Each way a hymnal writes the prefix, so dropping one from the
      // alternation is a failure here rather than a surprise in a service.
      "Hymn No. 12 Rock of Ages",
      "hymn no 8 Be Thou My Vision",
      "#7 Abide With Me",
      "007 Abide With Me",
      "All People That On Earth Do Dwell 100",
      "Praise",
      "0. Nothing",
      "",
    ];
    for (const label of labels) {
      expect([label, copied(label)]).toEqual([label, hymnNumberOf(label)]);
    }
  });
});

describe("the offline shell's copy of relativeDay", () => {
  /** The shell's own function, lifted out and run — behaviour, not text. */
  const copied = (() => {
    const source = shell.match(/function relativeDay\(value, today\) \{[\s\S]*?\n\}/);
    if (!source) throw new Error("offline.html no longer defines relativeDay");
    return new Function(`${source[0]}; return relativeDay;`)() as (
      value: string,
      today: string,
    ) => string;
  })();

  it("names a day exactly as the app does", () => {
    const today = "2026-09-06";
    const days = [
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      // Inside the week it is a weekday name; on the seventh day it is a date.
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-10-04",
      // A different year picks up the year, which is the easy half to drop.
      "2027-01-03",
      "2025-12-25",
    ];
    for (const day of days) {
      expect([day, copied(day, today)]).toEqual([day, relativeDayLabel(day, today)]);
    }
  });
});
