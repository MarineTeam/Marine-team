import { getCurrentLiveStream, getNextLiveStream } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { chatMessage, chatState } from "@/lib/live-chat";
import { isPluginEnabled } from "@/lib/plugins";
import { LiveChat } from "@/components/live-chat";
import { PremiereCountdown } from "@/components/premiere-countdown";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const liveOn = await isPluginEnabled("live-streaming");
  const [cachedCurrent, cachedNext, user] = liveOn
    ? await Promise.all([getCurrentLiveStream(), getNextLiveStream(), getCurrentUser()])
    : [null, null, null];

  // Both of these come through `unstable_cache`, which stores its answer as
  // JSON — so the `DateTime` columns arrive back as strings however the types
  // read. Anything calling a Date method on them throws at run time, in
  // production only, on the one page nobody loads until a service starts.
  const current = cachedCurrent
    ? {
        ...cachedCurrent,
        startAt: new Date(cachedCurrent.startAt),
        endAt: cachedCurrent.endAt ? new Date(cachedCurrent.endAt) : null,
      }
    : null;
  const next = cachedNext ? { ...cachedNext, startAt: new Date(cachedNext.startAt) } : null;

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

          {/* Rendered with the state the server worked out, so the panel is
              right on the first paint rather than after the first poll. */}
          <LiveChat
            streamId={current.id}
            signedIn={Boolean(user)}
            initialState={chatState(current)}
            message={chatMessage(chatState(current))}
          />
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
