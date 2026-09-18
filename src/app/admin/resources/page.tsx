import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { ResourcesManager } from "@/components/resources-manager";

/** The hall, the minibus, the projector. */
export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  if (!(await isPluginEnabled("resources"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/resources");
  if (!(await hasCapability(user, "manage_events"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Rooms &amp; resources</h1>
        <p className="mt-1 text-sm text-sec">
          A double booking is discovered on the Saturday by two groups standing in the same
          doorway. This refuses one at the moment of saving, and says what it clashed with.
        </p>
      </div>
      <ResourcesManager />
    </div>
  );
}
