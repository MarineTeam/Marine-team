import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { isStaff, hasCapability } from "@/lib/permissions";

const adminLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/files", label: "Files" },
  { href: "/admin/users", label: "Access" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/plugins", label: "Plugins" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/analytics", label: "Analytics" },
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
    const [canManageUsers, canManagePermissions, canManagePlugins, canViewAuditLog, canViewAnalytics] =
      await Promise.all([
        hasCapability(user, "manage_users"),
        hasCapability(user, "manage_permissions"),
        hasCapability(user, "manage_plugins"),
        hasCapability(user, "view_audit_log"),
        hasCapability(user, "view_analytics"),
      ]);
    links = [
      { href: "/admin/series", label: "Series" },
      { href: "/admin/videos", label: "Videos" },
      { href: "/admin/files", label: "Files" },
      ...(canManageUsers ? [{ href: "/admin/users", label: "Access" }] : []),
      ...(canManagePermissions ? [{ href: "/admin/permissions", label: "Permissions" }] : []),
      ...(canManagePlugins
        ? [
            { href: "/admin/plugins", label: "Plugins" },
            { href: "/admin/announcements", label: "Announcements" },
            { href: "/admin/webhooks", label: "Webhooks" },
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
