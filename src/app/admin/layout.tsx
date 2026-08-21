import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { AdminNav } from "@/components/admin-nav";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { isStaff, hasCapability, getCapabilityScope } from "@/lib/permissions";
import { adminGroupsFor, type AdminAccess } from "@/lib/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, identity] = await Promise.all([getCurrentUser(), getSessionIdentity()]);

  if (!user && !identity) redirect("/auth/login?returnTo=/admin");
  const staff = user ? await isStaff(user) : false;
  if (!user || !staff) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center">
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

  const groups = adminGroupsFor(await resolveAdminAccess(user));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:gap-8 sm:py-8">
      <AdminNav groups={groups} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Resolves every capability the nav's rules ask about, in one round rather
 * than one lookup per link. An admin short-circuits — adminGroupsFor gives
 * them every section, so the individual grants are moot.
 */
async function resolveAdminAccess(user: User): Promise<AdminAccess> {
  if (user.role === "ADMIN") {
    return {
      isAdmin: true,
      canManageUsers: true,
      canManagePermissions: true,
      canManagePlugins: true,
      canViewAuditLog: true,
      canViewAnalytics: true,
      canManageVideosSiteWide: true,
      canManageFiles: true,
      canModerateComments: true,
      canShareContent: true,
      canSeeTrash: true,
    };
  }

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

  return {
    isAdmin: false,
    canManageUsers,
    canManagePermissions,
    canManagePlugins,
    canViewAuditLog,
    canViewAnalytics,
    canManageVideosSiteWide,
    canManageFiles,
    canShareContent,
    // Scoped rather than site-wide: moderating one category's comments is
    // enough to need the queue.
    canModerateComments:
      moderateScope.isAdmin ||
      moderateScope.categoryIds.length > 0 ||
      moderateScope.seriesIds.length > 0,
    canSeeTrash: canManageCategories || canManageSeries || canManageVideosSiteWide || canManageFiles,
  };
}
