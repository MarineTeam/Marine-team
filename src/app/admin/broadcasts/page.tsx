import { BroadcastComposer } from "@/components/broadcast-composer";
import { audienceOptions } from "@/lib/broadcast-send";

export const dynamic = "force-dynamic";

/**
 * Writing to everybody at once.
 *
 * Under People rather than Church life, and gated on `manage_users`: writing
 * to every member is closer to holding the membership list than to booking the
 * hall, and the people trusted with one are not automatically trusted with the
 * other.
 */
export default async function AdminBroadcastsPage() {
  const options = await audienceOptions();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Announcements</h1>
        <p className="mt-1 text-sm text-sec">
          One message to everybody, or to one group. Email, text, or a push notification.
        </p>
      </div>
      <BroadcastComposer options={options} />
    </div>
  );
}
