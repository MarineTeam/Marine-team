import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { myGroups } from "@/lib/groups-query";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const metadata = { title: "Your groups" };
export const dynamic = "force-dynamic";

export default async function ProfileGroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/profile/groups");
  if (!(await isPluginEnabled("groups"))) {
    return <p className="text-sm text-sec">Small groups are switched off at the moment.</p>;
  }

  const { t } = await currentMessages();
  const memberships = await myGroups(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.groups.yourGroups}</h2>
        <p className="mt-1 text-sm text-sec">{t.groups.yourGroupsSubtitle}</p>
      </div>

      {memberships.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.groups.notInAGroup}{" "}
          <Link href="/groups" className="text-accent hover:underline">
            {t.groups.seeWhatThereIs} →
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {memberships.map((membership) => (
            <li key={membership.id}>
              <Link href={`/groups/${membership.group.slug}`} className="block px-4 py-3 hover:bg-hover">
                <span className="block text-sm font-medium text-ink">{membership.group.name}</span>
                <span className="block text-xs text-sec">
                  {[membership.group.meetsWhen, membership.group.area].filter(Boolean).join(" · ")}
                </span>
                {membership.status === "REQUESTED" && (
                  <span className="mt-0.5 block text-xs text-ter">
                    {t.groups.youveAsked}
                  </span>
                )}
                {membership.role === "LEADER" && (
                  <span className="mt-0.5 block text-xs text-ter">{t.groups.youLeadThis}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
