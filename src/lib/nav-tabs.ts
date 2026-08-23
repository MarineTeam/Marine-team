/**
 * Which icons sit in the bottom bar, and in what order.
 *
 * The app suggests a set (see getShellNav's `tabs`), but the bar is the
 * installed app's only navigation, so what belongs there depends on what the
 * person opens the app to do: a member who came for the hymnal wants the
 * hymnal, not "Recently played". The choice is stored per device alongside
 * the other device settings — it is about the screen in your hand, and it
 * works logged out.
 *
 * A tab is identified by its href. That is already unique, already stable
 * across renames (a category keeps its slug), and means a stored choice needs
 * no separate id table to resolve against — a destination that no longer
 * exists simply isn't found and is dropped.
 */

import type { NavItem } from "@/lib/nav";

/**
 * How many tabs fit across a phone before the labels stop being readable.
 * Up to this many share the width evenly, which is what a tab bar normally
 * looks like.
 */
export const TABS_ACROSS = 5;

/**
 * The most a device may choose. Past TABS_ACROSS the bar scrolls sideways
 * instead of squeezing, which is worth having for someone who wants their
 * hymnal, their songbook and the sections they teach from all within reach —
 * but a bar you have to scroll to see is still a bar you have to scroll to
 * see, so it doesn't go on forever.
 */
export const MAX_TABS = 10;

/**
 * What the offline shell reads to draw the same bar (public/offline.html),
 * written by BottomNav whenever it renders with a connection. The shell is a
 * static file that can't ask the server what the tabs are, so the last set
 * the app drew is left where it can find it.
 */
export const NAV_TABS_SNAPSHOT_KEY = "marine-nav-tabs";

/** The pieces of a tab the offline shell can draw with — no React, no badge. */
export type TabSnapshot = { href: string; label: string; icon: NavItem["icon"] };

/**
 * Reads a stored choice, from storage this app wrote or a previous version
 * did. Null means "no choice made" — which is different from an empty one,
 * and falls back to the app's own suggestion rather than an empty bar.
 */
export function parseTabHrefs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const hrefs: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.startsWith("/")) continue;
    if (!hrefs.includes(entry)) hrefs.push(entry);
    if (hrefs.length === MAX_TABS) break;
  }
  return hrefs;
}

/**
 * The tabs to actually draw: the chosen destinations, in the chosen order,
 * resolved against what this viewer may see.
 *
 * Resolving against `options` on every render is the point — a category that
 * has since been unpublished, or a page whose plugin was switched off, drops
 * out of the bar on its own rather than sitting there leading to a 404. If
 * nothing survives, the app's suggestion is used: an empty bar would leave an
 * installed app with no way to get anywhere.
 */
export function resolveTabs(options: NavItem[], chosen: string[] | null, suggested: NavItem[]): NavItem[] {
  if (chosen === null) return suggested;
  const byHref = new Map(options.map((option) => [option.href, option]));
  const picked = chosen
    .map((href) => byHref.get(href))
    .filter((item): item is NavItem => item !== undefined)
    .slice(0, MAX_TABS);
  return picked.length > 0 ? picked : suggested;
}

export function toSnapshot(tabs: NavItem[]): TabSnapshot[] {
  return tabs.map((tab) => ({ href: tab.href, label: tab.label, icon: tab.icon }));
}
