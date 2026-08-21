import { cache } from "react";
import { getBranding, type Branding } from "@/lib/branding";
import { getNavCategories } from "@/lib/content";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";
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
  /** The installed app's bottom strip. Kept short deliberately; five is already a lot on a phone. */
  tabs: NavItem[];
};

export const getShellNav = cache(async (): Promise<ShellNav> => {
  const [branding, user, identity, plugins, categories] = await Promise.all([
    getBranding(),
    getCurrentUser(),
    getSessionIdentity(),
    getPluginStates(),
    getNavCategories(),
  ]);

  const [staff, unreadCount] = await Promise.all([
    user ? isStaff(user) : Promise.resolve(false),
    user ? getUnreadNotificationCount(user.id) : Promise.resolve(0),
  ]);

  const browse: NavItem[] = [
    { href: "/", label: "Home", icon: "home", exact: true },
    { href: "/search", label: "Search", icon: "search" },
  ];
  if (plugins["live-streaming"]) browse.push({ href: "/live", label: "Live", icon: "live" });

  const library: NavItem[] = categories.map((category) => ({
    href: `/categories/${category.slug}`,
    label: category.name,
    icon: "folder" as const,
  }));

  const mine: NavItem[] = [];
  if (user) {
    if (plugins["watch-history"]) {
      mine.push({ href: "/recently-played", label: "Recently played", icon: "clock" });
    }
    if (plugins.favorites) mine.push({ href: "/favorites", label: "Favorites", icon: "star" });
    if (plugins["watch-later"]) {
      mine.push({ href: "/watch-later", label: "Watch later", icon: "sparkle" });
    }
    if (plugins.playlists) mine.push({ href: "/playlists", label: "Playlists", icon: "playlist" });
    if (plugins.subscriptions) {
      mine.push({ href: "/subscriptions", label: "Subscriptions", icon: "bell" });
    }
    if (plugins.downloads) {
      mine.push({ href: "/profile/downloads", label: "Downloads", icon: "download" });
    }
  }

  const sections: NavSection[] = [{ label: null, items: browse }];
  if (library.length > 0) sections.push({ label: "Library", items: library });
  if (mine.length > 0) sections.push({ label: "Your library", items: mine });
  if (staff) {
    sections.push({ label: null, items: [{ href: "/admin", label: "Admin", icon: "shield" }] });
  }

  // The tab strip is the installed app's only navigation, so it leads with
  // what someone opens the app to do and ends at the account area — where the
  // inbox lives, hence the badge.
  const tabs: NavItem[] = [{ href: "/", label: "Home", icon: "home", exact: true }];
  if (plugins["watch-history"]) {
    tabs.push({ href: "/recently-played", label: "Recently played", icon: "clock" });
  }
  if (plugins.favorites) tabs.push({ href: "/favorites", label: "Favorites", icon: "star" });
  tabs.push({ href: "/recently-added", label: "New", icon: "sparkle" });
  if (user) {
    tabs.push({ href: "/profile", label: "Profile", icon: "person", badge: unreadCount });
  }

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
  };
});
