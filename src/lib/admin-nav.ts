/**
 * The admin's sections, in one place.
 *
 * This used to be two hand-maintained arrays in admin/layout.tsx — a flat list
 * of everything for admins, and a separate one rebuilt from scratch for staff
 * with capabilities. Two lists of the same thing drift: they had already
 * disagreed on where Access attempts and Query Monitor belonged, and any new
 * screen had to be remembered twice.
 *
 * One list now, each entry carrying the rule for who sees it, grouped so
 * twenty-four links read as five short sections instead of one long scroll.
 */

import { isActivePath } from "./active-path";

/** The overview, and the prefix every other admin href sits under. */
export const ADMIN_ROOT = "/admin";

export type AdminAccess = {
  /** Admins see everything; the per-link rules below are for everyone else. */
  isAdmin: boolean;
  canManageUsers: boolean;
  canManagePermissions: boolean;
  canManagePlugins: boolean;
  canViewAuditLog: boolean;
  canViewAnalytics: boolean;
  canManageVideosSiteWide: boolean;
  canManageFiles: boolean;
  canModerateComments: boolean;
  canShareContent: boolean;
  /** The diary, the sign-up sheets and the group list — one job, one grant. */
  canManageEvents: boolean;
  /** Anyone who can manage something that lands in the trash can empty it. */
  canSeeTrash: boolean;
};

type AdminLink = {
  href: string;
  label: string;
  /**
   * Whether a non-admin staff member sees this. `() => true` means every staff
   * member does; `() => false` means it stays admin-only.
   */
  visible: (access: AdminAccess) => boolean;
};

export type AdminGroup = { label: string | null; links: AdminLink[] };

/** What the nav renders once the rules above have been resolved. */
export type ResolvedAdminGroup = { label: string | null; links: { href: string; label: string }[] };

const always = () => true;
const adminOnly = () => false;

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    label: null,
    links: [
      // /admin redirects a non-admin to /admin/series, so offering it to them
      // would be a link straight to a bounce.
      { href: ADMIN_ROOT, label: "Overview", visible: adminOnly },
    ],
  },
  {
    label: "Library",
    links: [
      { href: "/admin/categories", label: "Categories", visible: adminOnly },
      { href: "/admin/series", label: "Series", visible: always },
      { href: "/admin/videos", label: "Videos", visible: always },
      { href: "/admin/speakers", label: "Speakers", visible: (a) => a.canManageVideosSiteWide },
      { href: "/admin/live", label: "Live streaming", visible: (a) => a.canManageVideosSiteWide },
      { href: "/admin/files", label: "Files", visible: always },
      // A plan is a list of files, so whoever may arrange the library may
      // arrange a service — see the services API for why that's the gate.
      { href: "/admin/services", label: "Services", visible: (a) => a.canManageFiles },
      // The people who serve at those services — same gate, since whoever
      // arranges a service arranges who is at it.
      { href: "/admin/teams", label: "Teams", visible: (a) => a.canManageFiles },
      // The other kind of rota: names on a spreadsheet, read by people with
      // no account. Same gate — it is the same job.
      { href: "/admin/schedules", label: "Schedules", visible: (a) => a.canManageFiles },
    ],
  },
  {
    label: "Church life",
    links: [
      // A different job from the media library, and a different gate: a
      // registration list carries names and phone numbers that /admin/videos
      // never does.
      { href: "/admin/events", label: "Events", visible: (a) => a.canManageEvents },
      { href: "/admin/forms", label: "Forms", visible: (a) => a.canManageEvents },
    ],
  },
  {
    label: "Moderation",
    links: [
      { href: "/admin/comments", label: "Comment moderation", visible: (a) => a.canModerateComments },
      { href: "/admin/share-links", label: "Share links", visible: (a) => a.canShareContent },
      { href: "/admin/trash", label: "Trash", visible: (a) => a.canSeeTrash },
      // Gated on manage_files to match the audit route: it reconciles the whole
      // library, so a partial view would mislead rather than help.
      { href: "/admin/media-check", label: "Media check", visible: (a) => a.canManageFiles },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/admin/users", label: "Members & roles", visible: (a) => a.canManageUsers },
      { href: "/admin/authorized-emails", label: "Who can sign in", visible: (a) => a.canManageUsers },
      { href: "/admin/permissions", label: "Permissions", visible: (a) => a.canManagePermissions },
      { href: "/admin/access-attempts", label: "Access attempts", visible: (a) => a.canViewAuditLog },
    ],
  },
  {
    label: "Configuration",
    links: [
      { href: "/admin/branding", label: "Branding", visible: (a) => a.canManagePlugins },
      { href: "/admin/plugins", label: "Plugins", visible: (a) => a.canManagePlugins },
      { href: "/admin/home-rows", label: "Homepage", visible: (a) => a.canManagePlugins },
      { href: "/admin/downloads", label: "Downloads", visible: (a) => a.canManagePlugins },
      { href: "/admin/announcements", label: "Announcements", visible: (a) => a.canManagePlugins },
      { href: "/admin/webhooks", label: "Webhooks", visible: (a) => a.canManagePlugins },
    ],
  },
  {
    label: "Insight",
    links: [
      { href: "/admin/analytics", label: "Analytics", visible: (a) => a.canViewAnalytics },
      { href: "/admin/audit", label: "Audit log", visible: (a) => a.canViewAuditLog },
      { href: "/admin/query-monitor", label: "Query Monitor", visible: (a) => a.canManagePlugins },
    ],
  },
];

/**
 * The groups this person may see, with empty groups dropped so no heading is
 * left standing over nothing.
 *
 * Note this decides what is *offered*, not what is permitted — every admin
 * route and API checks its own capability. Hiding a link nobody can use is a
 * courtesy; it is never the thing keeping anyone out.
 */
export function adminGroupsFor(access: AdminAccess): ResolvedAdminGroup[] {
  return ADMIN_GROUPS.map((group) => ({
    label: group.label,
    links: group.links
      .filter((link) => access.isAdmin || link.visible(access))
      .map(({ href, label }) => ({ href, label })),
  })).filter((group) => group.links.length > 0);
}

/**
 * Whether an admin link is the page being viewed.
 *
 * The overview matches only itself: every admin page sits under /admin, so a
 * prefix match there would light the overview up on all of them. Shared by the
 * rail and the label below, which have to agree about where you are.
 */
export function isAdminLinkActive(pathname: string, href: string): boolean {
  return isActivePath(pathname, href, href === ADMIN_ROOT);
}

/**
 * The label of the section currently open, for the collapsed nav on a phone —
 * which shows where you are instead of making you find it in a scroller.
 *
 * Longest matching href wins, so /admin/share-links doesn't resolve to the
 * /admin overview. A page no link claims — a new screen, or one hidden from
 * this person — falls back to "Admin" rather than borrowing another section's
 * name.
 */
export function currentAdminLabel(groups: ResolvedAdminGroup[], pathname: string): string {
  let best = "";
  let label = "Admin";
  for (const group of groups) {
    for (const link of group.links) {
      if (isAdminLinkActive(pathname, link.href) && link.href.length > best.length) {
        best = link.href;
        label = link.label;
      }
    }
  }
  return label;
}
