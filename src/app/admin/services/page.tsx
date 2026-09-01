import Link from "next/link";
import { ServicePlansManager } from "@/components/service-plans-manager";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The running order of hymns for a service, which members open as one list.
 * Reachable whether or not the plugin is on, so a plan can be prepared before
 * the feature is switched on for everyone.
 */
export default async function AdminServicesPage() {
  const pluginOn = await isPluginEnabled("service-plans");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Services</h1>
        <p className="mt-1 text-sm text-sec">
          The hymns for a service, in the order they&apos;ll be sung. Members open a published plan at{" "}
          <code>/services</code> and tap straight through to each hymn.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Service plans</strong> plugin is switched off, so members can&apos;t see these yet.
            Plans can still be prepared here.
          </p>
        )}
      </div>
      {/* The plans are also the record of what was sung, which is what a
          licence return asks for once a year. */}
      <p className="text-sm">
        <Link href="/admin/services/report" className="text-accent hover:underline">
          What we sang →
        </Link>{" "}
        <span className="text-sec">a song-by-song count for a licence return.</span>
      </p>

      <ServicePlansManager />
    </div>
  );
}
