import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { adminGroupsFor } from "@/lib/admin-nav";
import { countRecentAccessAttempts } from "@/lib/authorization";

/**
 * The admin's landing screen: what needs looking at, how much there is, and
 * the way into every section.
 *
 * The section list matters most on a phone, where the rail collapses to a
 * single button — this is where you go to see the whole shape of the admin
 * rather than opening the sheet and scrolling it.
 */
export default async function AdminOverview() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/admin/series");

  const [categories, series, videos, files, reportedComments, recentAttempts, drafts] =
    await Promise.all([
      prisma.category.count({ where: { deletedAt: null } }),
      prisma.series.count({ where: { deletedAt: null } }),
      prisma.video.count({ where: { deletedAt: null } }),
      prisma.fileAsset.count({ where: { deletedAt: null } }),
      prisma.commentReport.count(),
      countRecentAccessAttempts(7),
      prisma.series.count({ where: { deletedAt: null, published: false } }),
    ]);

  const stats = [
    { label: "Categories", value: categories },
    { label: "Series", value: series },
    { label: "Videos", value: videos },
    { label: "Files", value: files },
  ];

  // Only what someone can act on right now. A zero is dropped rather than
  // shown as "0 reported comments" — an empty queue isn't news.
  const attention = [
    {
      href: "/admin/comments",
      label: reportedComments === 1 ? "1 reported comment" : `${reportedComments} reported comments`,
      detail: "Waiting in the moderation queue.",
      count: reportedComments,
    },
    {
      href: "/admin/access-attempts",
      label: recentAttempts === 1 ? "1 refused sign-in" : `${recentAttempts} refused sign-ins`,
      detail: "In the last seven days.",
      count: recentAttempts,
    },
    {
      href: "/admin/series",
      label: drafts === 1 ? "1 unpublished series" : `${drafts} unpublished series`,
      detail: "Drafted but not yet visible to anyone.",
      count: drafts,
    },
  ].filter((item) => item.count > 0);

  // The same grouping the nav uses, so the two can't tell different stories
  // about what the admin contains. Admins see every section.
  const groups = adminGroupsFor({
    isAdmin: true,
    canManageUsers: true,
    canManagePermissions: true,
    canManagePlugins: true,
    canViewAuditLog: true,
    canManageApiKeys: true,
    canViewAnalytics: true,
    canManageVideosSiteWide: true,
    canManageFiles: true,
    canModerateComments: true,
    canShareContent: true,
    canManageEvents: true,
    canModeratePrayer: true,
    canSeeTrash: true,
  }).filter((group) => group.label !== null);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Admin</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-2xl font-semibold tabular-nums">{stat.value.toLocaleString("en-GB")}</p>
            <p className="text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[10.5px] font-bold tracking-[0.09em] text-zinc-500 uppercase">
            Needs attention
          </h2>
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {attention.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-zinc-500">{item.detail}</span>
                </span>
                <span aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <h2 className="text-[10.5px] font-bold tracking-[0.09em] text-zinc-500 uppercase">
            {group.label}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
