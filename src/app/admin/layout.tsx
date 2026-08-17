import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { isStaff, hasCapability, getCapabilityScope } from "@/lib/permissions";

const adminLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/speakers", label: "Speakers" },
  { href: "/admin/live", label: "Live streaming" },
  { href: "/admin/files", label: "Files" },
  { href: "/admin/comments", label: "Comment moderation" },
  { href: "/admin/share-links", label: "Share links" },
  { href: "/admin/trash", label: "Trash" },
  { href: "/admin/users", label: "Access" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/plugins", label: "Plugins" },
  { href: "/admin/home-rows", label: "Homepage" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/query-monitor", label: "Query Monitor" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, identity] = await Promise.all([getCurrentUser(), getSessionIdentity()]);

  if (!user && !identity) redirect("/auth/login?returnTo=/admin");
  const staff = user ? await isStaff(user) : false;
  if (!user || !staff) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="font-medium">You don&apos;t have access to the admin dashboard.</p>
        {!user && (
          <a
            href="/auth/logout"
            className="inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Log out
          </a>
        )}
      </div>
    );
  }

  let links = adminLinks;
  if (user.role !== "ADMIN") {
    const [
      canManageUsers,
      canManagePermissions,
      canManagePlugins,
      canViewAuditLog,
      canViewAnalytics,
      canManageVideosSiteWide,
      canManageCategories,
      canManageSeries,
      canManageFiles,
      canShareContent,
      moderateScope,
    ] = await Promise.all([
      hasCapability(user, "manage_users"),
      hasCapability(user, "manage_permissions"),
      hasCapability(user, "manage_plugins"),
      hasCapability(user, "view_audit_log"),
      hasCapability(user, "view_analytics"),
      hasCapability(user, "manage_videos"),
      hasCapability(user, "manage_categories"),
      hasCapability(user, "manage_series"),
      hasCapability(user, "manage_files"),
      hasCapability(user, "share_content"),
      getCapabilityScope(user, "moderate_comments"),
    ]);
    const canModerateComments =
      moderateScope.isAdmin || moderateScope.categoryIds.length > 0 || moderateScope.seriesIds.length > 0;
    const canSeeTrash = canManageCategories || canManageSeries || canManageVideosSiteWide || canManageFiles;
    links = [
      { href: "/admin/series", label: "Series" },
      { href: "/admin/videos", label: "Videos" },
      ...(canManageVideosSiteWide
        ? [
            { href: "/admin/speakers", label: "Speakers" },
            { href: "/admin/live", label: "Live streaming" },
          ]
        : []),
      { href: "/admin/files", label: "Files" },
      ...(canModerateComments ? [{ href: "/admin/comments", label: "Comment moderation" }] : []),
      ...(canShareContent ? [{ href: "/admin/share-links", label: "Share links" }] : []),
      ...(canSeeTrash ? [{ href: "/admin/trash", label: "Trash" }] : []),
      ...(canManageUsers ? [{ href: "/admin/users", label: "Access" }] : []),
      ...(canManagePermissions ? [{ href: "/admin/permissions", label: "Permissions" }] : []),
      ...(canManagePlugins
        ? [
            { href: "/admin/plugins", label: "Plugins" },
            { href: "/admin/home-rows", label: "Homepage" },
            { href: "/admin/announcements", label: "Announcements" },
            { href: "/admin/webhooks", label: "Webhooks" },
            { href: "/admin/query-monitor", label: "Query Monitor" },
          ]
        : []),
      ...(canViewAuditLog ? [{ href: "/admin/audit", label: "Audit log" }] : []),
      ...(canViewAnalytics ? [{ href: "/admin/analytics", label: "Analytics" }] : []),
    ];
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col sm:flex-row gap-4 sm:gap-8">
      <aside className="sm:w-48 sm:shrink-0 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-zinc-200 pb-2 sm:border-none sm:pb-0 dark:border-zinc-800">
        <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:space-y-1 sm:overflow-visible text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block whitespace-nowrap rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
