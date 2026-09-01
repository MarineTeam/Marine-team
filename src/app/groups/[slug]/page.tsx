import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupPanel } from "@/components/group-panel";
import { getCurrentUser } from "@/lib/current-user";
import { getGroup, viewerFor } from "@/lib/groups-query";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GroupPage(props: { params: Promise<{ slug: string }> }) {
  if (!(await isPluginEnabled("groups"))) notFound();
  const { slug } = await props.params;
  const viewer = await viewerFor(await getCurrentUser());
  const group = await getGroup(slug, viewer);
  if (!group) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <p className="text-sm">
        <Link href="/groups" className="text-accent hover:underline">
          ← Small groups
        </Link>
      </p>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{group.name}</h1>
        <p className="mt-1 text-sm text-sec">
          {[group.meetsWhen, group.area].filter(Boolean).join(" · ")}
        </p>
        {group.leaders.length > 0 && (
          <p className="text-sm text-sec">
            Led by {group.leaders.join(" and ")}
          </p>
        )}
      </div>

      {group.description && (
        <p className="text-sm whitespace-pre-wrap text-ink">{group.description}</p>
      )}

      {/* Only reaches the page at all for somebody in the group — see
          presentGroup, which is the one place that decides. */}
      {group.address && (
        <div className="rounded-lg border border-sep p-4">
          <p className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Where</p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{group.address}</p>
        </div>
      )}

      <GroupPanel slug={group.slug} standing={group.standing} state={group.joinState} />
    </div>
  );
}
