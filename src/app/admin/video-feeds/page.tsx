import { VideoFeedsManager } from "@/components/video-feeds-manager";

export const dynamic = "force-dynamic";

/**
 * Importing from YouTube and Vimeo.
 *
 * A church that already streams its service every Sunday has the sermon there
 * before anybody thinks about this app. Re-uploading it costs storage,
 * bandwidth and somebody's Sunday afternoon; pointing at it costs nothing.
 */
export default function AdminVideoFeedsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Import from YouTube or Vimeo</h1>
        <p className="mt-1 text-sm text-sec">
          Imported videos are ordinary videos here — filed into a series, given a speaker and
          scripture references, searched, favourited — and play in the source&apos;s own player.
        </p>
        <p className="mt-2 text-xs text-ter">
          Renaming an imported video, or rewriting its description, is permanent: a later import
          leaves anything you have edited alone and only updates what nobody has touched.
        </p>
      </div>
      <VideoFeedsManager />
    </div>
  );
}
