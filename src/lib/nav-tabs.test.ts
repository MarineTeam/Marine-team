import { describe, expect, it } from "vitest";
import { MAX_TABS, parseTabHrefs, resolveTabs, TABS_ACROSS, toSnapshot } from "./nav-tabs";
import type { NavItem } from "./nav";

const options: NavItem[] = [
  { href: "/", label: "Home", icon: "home", exact: true },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/categories/hymnals", label: "Hymnals", icon: "book" },
  { href: "/profile", label: "Profile", icon: "person", badge: 3 },
];
const suggested: NavItem[] = [options[0], options[3]];

describe("parseTabHrefs", () => {
  it("reads a stored choice back", () => {
    expect(parseTabHrefs(["/", "/categories/hymnals"])).toEqual(["/", "/categories/hymnals"]);
  });

  it("tells no choice from an empty one", () => {
    // Null falls back to the app's suggestion; an empty array is a deliberate
    // (if odd) choice, and resolveTabs is what refuses to draw nothing.
    expect(parseTabHrefs(undefined)).toBeNull();
    expect(parseTabHrefs("/")).toBeNull();
    expect(parseTabHrefs([])).toEqual([]);
  });

  it("drops entries that aren't hrefs, and repeats", () => {
    expect(parseTabHrefs(["/", 7, null, "/", "search"])).toEqual(["/"]);
  });

  it("keeps more than fit across the screen — those scroll — but not without limit", () => {
    const seven = ["/a", "/b", "/c", "/d", "/e", "/f", "/g"];
    expect(seven.length).toBeGreaterThan(TABS_ACROSS);
    expect(parseTabHrefs(seven)).toHaveLength(7);

    const tooMany = Array.from({ length: MAX_TABS + 4 }, (_, i) => `/p${i}`);
    expect(parseTabHrefs(tooMany)).toHaveLength(MAX_TABS);
  });
});

describe("resolveTabs", () => {
  it("uses the app's suggestion when nothing was chosen", () => {
    expect(resolveTabs(options, null, suggested)).toEqual(suggested);
  });

  it("keeps the chosen order, not the catalogue's", () => {
    const tabs = resolveTabs(options, ["/profile", "/"], suggested);
    expect(tabs.map((t) => t.href)).toEqual(["/profile", "/"]);
  });

  it("carries the whole item through, badge included", () => {
    expect(resolveTabs(options, ["/profile"], suggested)[0].badge).toBe(3);
  });

  it("drops a destination this viewer no longer has", () => {
    // A category that was unpublished, or a page whose plugin was turned off.
    const tabs = resolveTabs(options, ["/", "/categories/gone"], suggested);
    expect(tabs.map((t) => t.href)).toEqual(["/"]);
  });

  it("falls back rather than leaving an installed app with no navigation", () => {
    expect(resolveTabs(options, ["/categories/gone"], suggested)).toEqual(suggested);
    expect(resolveTabs(options, [], suggested)).toEqual(suggested);
  });
});

describe("toSnapshot", () => {
  it("keeps only what the offline shell can draw", () => {
    expect(toSnapshot([options[3]])).toEqual([{ href: "/profile", label: "Profile", icon: "person" }]);
  });
});
