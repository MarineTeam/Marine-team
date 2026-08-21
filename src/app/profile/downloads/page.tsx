import { getCurrentUser } from "@/lib/current-user";
import { getDownloadAccessSummary } from "@/lib/downloads";
import { DownloadsManager } from "@/components/downloads-manager";

/**
 * The member's downloads: whether they may download at all (resolved
 * server-side from the plugin and the download policy) and what this
 * particular device is holding (resolved client-side, since the files live in
 * the browser's own cache and the server is never told about them).
 */
export default async function ProfileDownloadsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const { pluginOn, permitted, platform, maxDeviceGb } = await getDownloadAccessSummary(user);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Downloads</h2>
        <p className="mt-1 text-sm text-sec">
          Videos saved to this device play without a connection. They&apos;re stored per device, so what you
          download on your phone won&apos;t appear here on a computer.
        </p>
      </div>
      <DownloadsManager
        pluginOn={pluginOn}
        permitted={permitted}
        platform={platform}
        maxDeviceGb={maxDeviceGb}
      />
    </div>
  );
}
