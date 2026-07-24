import { VideoManager } from "@/components/video-manager";

export default function VideosAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Videos</h1>
        <p className="text-sm text-zinc-500">
          Manage every video across all series. To add episodes to a specific series, open it from
          the Series tab instead.
        </p>
      </div>
      <VideoManager />
    </div>
  );
}
