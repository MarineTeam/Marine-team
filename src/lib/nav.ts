import { cache } from "react";
import { getBranding, type Branding } from "@/lib/branding";
import { getNavCategories } from "@/lib/content";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";
import { messagesFor } from "@/lib/i18n";
import { currentLocale } from "@/lib/i18n/locale";
import { getPluginStates } from "@/lib/plugins";
import { isStaff } from "@/lib/permissions";
import { getDisplayName } from "@/lib/profile";

/**
 * Everything the app's chrome needs, resolved once per request.
 *
 * The sidebar, the header/app bar and the tab strip all want the same
 * things — who's logged in, which optional features are on, what the
 * categories are, how many notifications are waiting — and all three render
 * on every single page. Fetching independently meant the same handful of
 * queries three times per navigation; `cache()` collapses that to one.
 *
 * It also puts the *shape* of the navigation in one place, so the rail and
 * the tab strip can't drift into offering different sections.
 */

export type NavIcon =
  | "home"
  | "search"
  | "clock"
  | "star"
  | "sparkle"
  | "bell"
  | "folder"
  | "playlist"
  | "book"
  | "live"
  | "person"
  | "download"
  | "calendar"
  | "ticket"
  | "card"
  | "hands"
  | "people"
  | "tv"
  | "shield";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Home would otherwise light up on every route, since every path starts with "/". */
  exact?: boolean;
  badge?: number;
};

export type NavSection = {
  /** Rendered as a small uppercase heading; null runs the items straight on. */
  label: string | null;
  items: NavItem[];
};

export type ShellNav = {
  branding: Branding;
  /** The optional-feature switches, passed on to the menus so they offer only what is on. */
  plugins: Awaited<ReturnType<typeof getPluginStates>>;
  account: { name: string; email: string; picture: string | null; href: string } | null;
  /** Logged in to Auth0 but not allowed in — the header says so rather than offering "Log in" again. */
  unauthorized: boolean;
  isStaff: boolean;
  unreadCount: number;
  /** The left rail's grouped sections. */
  sections: NavSection[];
  /**
   * The installed app's bottom strip, as the app itself would arrange it.
   * Kept short deliberately; five is already a lot on a phone. A device that
   * has chosen its own set overrides this in the browser — see
   * lib/nav-tabs.ts — which is why `tabOptions` travels with it.
   */
  tabs: NavItem[];
  /** Everything this viewer could put in that strip, for the picker in settings. */
  tabOptions: NavItem[];
};

export const getShellNav = cache(async (): Promise<ShellNav> => {
  const [branding, user, identity, plugins, categories, locale] = await Promise.all([
    getBranding(),
    getCurrentUser(),
    getSessionIdentity(),
    getPluginStates(),
    getNavCategories(),
    currentLocale(),
  ]);
  // The rail and the tab strip are on every page, so this is where a language
  // choice is most visible — and the category names below are deliberately
  // *not* translated: they are content an admin typed, not chrome.
  const t = messagesFor(locale).nav;

  const [staff, unreadCount] = await Promise.all([
    user ? isStaff(user) : Promise.resolve(false),
    user ? getUnreadNotificationCount(user.id) : Promise.resolve(0),
  ]);

  const browse: NavItem[] = [
    { href: "/", label: t.home, icon: "home", exact: true },
    { href: "/search", label: t.search, icon: "search" },
  ];
  if (plugins["live-streaming"]) browse.push({ href: "/live", label: t.live, icon: "live" });
  // The running order for a service — what somebody opens on the way in.
  if (plugins["service-plans"]) browse.push({ href: "/services", label: t.services, icon: "calendar" });
  // What's on. Public, because the people it most wants to reach are the ones
  // who have never made an account.
  if (plugins.events) browse.push({ href: "/events", label: t.events, icon: "ticket" });
  // The connect card, and whatever else there is to fill in.
  if (plugins.forms) browse.push({ href: "/forms", label: t.forms, icon: "card" });
  if (plugins.prayer) browse.push({ href: "/prayer", label: t.prayer, icon: "hands" });
  if (plugins.groups) browse.push({ href: "/groups", label: t.groups, icon: "people" });

  const library: NavItem[] = categories.map((category) => ({
    href: `/categories/${category.slug}`,
    label: category.name,
    // A hymnal section reads as books, not as a folder — and it is the
    // category most likely to be put in the bottom bar.
    icon: category.hymnalStyle ? ("book" as const) : ("folder" as const),
  }));

  const mine: NavItem[] = [];
  if (user) {
    if (plugins["watch-history"]) {
      mine.push({ href: "/recently-played", label: t.recentlyPlayed, icon: "clock" });
    }
    if (plugins.favorites) mine.push({ href: "/favorites", label: t.favorites, icon: "star" });
    if (plugins["watch-later"]) {
      mine.push({ href: "/watch-later", label: t.watchLater, icon: "sparkle" });
    }
    if (plugins.playlists) mine.push({ href: "/playlists", label: t.playlists, icon: "playlist" });
    if (plugins.subscriptions) {
      mine.push({ href: "/subscriptions", label: t.subscriptions, icon: "bell" });
    }
    if (plugins.downloads) {
      mine.push({ href: "/profile/downloads", label: t.downloads, icon: "download" });
    }
    if (plugins.events) {
      mine.push({ href: "/profile/events", label: t.yourEvents, icon: "ticket" });
    }
    if (plugins.groups) {
      mine.push({ href: "/profile/groups", label: t.yourGroups, icon: "people" });
    }
    if (plugins.tv) {
      mine.push({ href: "/profile/devices", label: t.televisions, icon: "tv" });
    }
  }

  const sections: NavSection[] = [{ label: null, items: browse }];
  if (library.length > 0) sections.push({ label: t.library, items: library });
  if (mine.length > 0) sections.push({ label: t.yourLibrary, items: mine });
  if (staff) {
    sections.push({ label: null, items: [{ href: "/admin", label: t.admin, icon: "shield" }] });
  }

  // The tab strip is the installed app's only navigation, so it leads with
  // what someone opens the app to do and ends at the account area — where the
  // inbox lives, hence the badge.
  const tabs: NavItem[] = [{ href: "/", label: "Home", icon: "home", exact: true }];
  if (plugins["watch-history"]) {
    tabs.push({ href: "/recently-played", label: t.recentlyPlayed, icon: "clock" });
  }
  if (plugins.favorites) tabs.push({ href: "/favorites", label: t.favorites, icon: "star" });
  tabs.push({ href: "/recently-added", label: t.new, icon: "sparkle" });
  if (user) {
    tabs.push({ href: "/profile", label: t.profile, icon: "person", badge: unreadCount });
  }

  // Everything a device may choose between. Ordered as the rail is — the
  // places to browse, then the library, then what's yours — so the picker
  // reads like the app rather than like a list of URLs.
  const tabOptions: NavItem[] = [
    ...browse,
    { href: "/recently-added", label: t.new, icon: "sparkle" },
    ...library,
    ...mine,
  ];
  if (user) {
    tabOptions.push({ href: "/profile", label: t.profile, icon: "person", badge: unreadCount });
  }
  if (staff) tabOptions.push({ href: "/admin", label: t.admin, icon: "shield" });

  return {
    branding,
    plugins,
    account: user
      ? {
          name: getDisplayName(user),
          email: user.email,
          picture: user.picture,
          href: "/profile",
        }
      : null,
    unauthorized: !user && identity !== null,
    isStaff: staff,
    unreadCount,
    sections,
    tabs,
    tabOptions,
  };
});
