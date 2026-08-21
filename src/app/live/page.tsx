import { getCurrentLiveStream, getNextLiveStream } from "@/lib/content";
import { isPluginEnabled } from "@/lib/plugins";
import { PremiereCountdown } from "@/components/premiere-countdown";

export default async function LivePage() {
  const liveOn = await isPluginEnabled("live-streaming");
  const [current, next] = liveOn
    ? await Promise.all([getCurrentLiveStream(), getNextLiveStream()])
    : [null, null];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Live</h1>

      {!liveOn && <p className="text-sec">Live streaming isn&apos;t enabled on this site.</p>}

      {liveOn && current && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
            <h2 className="text-lg font-semibold text-ink">{current.title}</h2>
          </div>
          {current.description && <p className="text-sec">{current.description}</p>}
          <div className="aspect-video overflow-hidden rounded-lg bg-black">
            <iframe
              src={current.embedUrl}
              className="h-full w-full"
              allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {liveOn && !current && next && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">{next.title}</h2>
          {next.description && <p className="text-sec">{next.description}</p>}
          <PremiereCountdown premiereAt={next.startAt.toISOString()} label="Live starts in" />
        </div>
      )}

      {liveOn && !current && !next && (
        <p className="text-sec">Nothing live right now — check back later.</p>
      )}
    </div>
  );
}
