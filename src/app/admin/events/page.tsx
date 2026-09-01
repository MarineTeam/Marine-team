import { EventsManager } from "@/components/events-manager";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The diary. Reachable whether or not the plugin is on, so next year's camp
 * can be set up before anyone is told about it.
 */
export default async function AdminEventsPage() {
  const pluginOn = await isPluginEnabled("events");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Events</h1>
        <p className="mt-1 text-sm text-sec">
          What&apos;s on, and who&apos;s coming. Members and visitors see published events at{" "}
          <code>/events</code>.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Events</strong> plugin is switched off, so nobody can see these yet. They can
            still be prepared here.
          </p>
        )}
      </div>
      <EventsManager />
    </div>
  );
}
