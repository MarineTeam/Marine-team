import { DownloadsManager } from "@/components/downloads-manager";

export default function ProfileDownloadsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Downloads</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Offline playback is still to come. Your network preference is saved now so it&apos;s ready when it lands.
        </p>
      </div>
      <DownloadsManager />
    </div>
  );
}
