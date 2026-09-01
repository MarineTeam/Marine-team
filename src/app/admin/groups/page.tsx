import { GroupsManager } from "@/components/groups-manager";
import { isPluginEnabled } from "@/lib/plugins";

export default async function AdminGroupsPage() {
  const pluginOn = await isPluginEnabled("groups");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Small groups</h1>
        <p className="mt-1 text-sm text-sec">
          The home groups and studies that meet during the week. Members find them at{" "}
          <code>/groups</code> and ask to join; the leader of each group answers, not this screen.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Small groups</strong> plugin is switched off, so nobody can see these yet.
          </p>
        )}
      </div>
      <GroupsManager />
    </div>
  );
}
