import { PrayerModeration } from "@/components/prayer-moderation";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The prayer wall's queue.
 *
 * Nothing a member writes appears until somebody here lets it through. That
 * isn't a setting — an unmoderated prayer wall on a church website is a
 * liability with a "post" button, and the day it is abused is the day somebody
 * would have gone looking for the switch.
 */
export default async function AdminPrayerPage() {
  const pluginOn = await isPluginEnabled("prayer");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Prayer wall</h1>
        <p className="mt-1 text-sm text-sec">
          Everything written at <code>/prayer</code> waits here until somebody puts it up.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Prayer wall</strong> plugin is switched off, so nobody can write or read
            these at the moment.
          </p>
        )}
        <p className="mt-2 text-xs text-ter">
          A request somebody asked to post anonymously shows as “Anonymous” here too. That is
          deliberate: this screen gets left open, and a screenshot of it is how an anonymous request
          stops being one.
        </p>
      </div>
      <PrayerModeration />
    </div>
  );
}
