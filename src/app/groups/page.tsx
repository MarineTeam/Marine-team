import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listGroups, viewerFor } from "@/lib/groups-query";
import { format } from "@/lib/i18n";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Small groups",
  description: "Where people meet during the week.",
  // The list carries leaders' names, so it stays out of search results.
  robots: { index: false, follow: false },
};

/**
 * The group directory.
 *
 * It says where each group is only as far as a district — the exact address
 * reaches people who are actually in the group, and nobody else. Most of these
 * meet in somebody's living room.
 */
export default async function GroupsPage() {
  if (!(await isPluginEnabled("groups"))) notFound();
  const [viewer, { t }] = await Promise.all([viewerFor(await getCurrentUser()), currentMessages()]);
  const groups = await listGroups(viewer);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.groups.title}</h1>
        <p className="mt-1 text-sm text-sec">{t.groups.subtitle}</p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.groups.noneListed}
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {groups.map((group) => (
            <li key={group.id}>
              <Link href={`/groups/${group.slug}`} className="block px-4 py-3 hover:bg-hover">
                <span className="block text-sm font-medium text-ink">{group.name}</span>
                <span className="block text-xs text-sec">
                  {[group.meetsWhen, group.area, group.leaders.join(" & ")].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-0.5 block text-xs text-ter">
                  {group.standing === "member" || group.standing === "leader"
                    ? t.groups.youreIn
                    : group.standing === "requested"
                      ? t.groups.youveAsked
                      : group.joinState === "full"
                        ? t.events.full
                        : group.joinState === "closed"
                          ? t.groups.notTakingNew
                          : group.memberCount === 1
                            ? t.groups.onePerson
                            : format(t.groups.people, { count: group.memberCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
