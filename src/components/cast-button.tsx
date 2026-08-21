"use client";

import { useEffect, useState } from "react";

/**
 * Chromecast, unlike AirPlay, can't just play Bunny's iframe embed: the
 * default receiver needs a direct, castable media URL. This reuses the
 * signed MP4 endpoint built for the Downloads plugin (/api/downloads/
 * [videoId]) as that source — the same file, the same access/availability
 * checks, just handed to a cast session instead of saved to the device.
 *
 * Built against Google's documented Cast Web Sender API (no npm types
 * package for it, hence the local, minimal ambient types below rather than
 * a full SDK type surface). NOT verified against a real Chromecast device —
 * there isn't one in this environment. Check this on a preview deploy with
 * an actual receiver before relying on it.
 *
 * AirPlay needs no code here: Safari shows its own AirPlay control for any
 * actively-playing <video>, including one inside Bunny's iframe, since
 * that's a system-level media route rather than something the missing
 * postMessage API would block.
 */

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    chrome?: { cast?: ChromeCastNamespace };
    cast?: { framework: CastFramework };
  }
}

// The "react-jsx" transform resolves intrinsic elements off React's own
// exported JSX namespace rather than the bare global one, so the custom
// element the Cast Framework registers itself has to be added here.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- ambient module augmentation of React's JSX namespace requires this syntax
  namespace JSX {
    interface IntrinsicElements {
      "google-cast-launcher": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

interface ChromeCastMediaInfo {
  metadata?: unknown;
}

interface ChromeCastMetadata {
  title: string;
  images: { url: string }[];
}

interface ChromeCastNamespace {
  media: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (contentId: string, contentType: string) => ChromeCastMediaInfo;
    GenericMediaMetadata: new () => ChromeCastMetadata;
    LoadRequest: new (mediaInfo: ChromeCastMediaInfo) => unknown;
  };
}

interface CastSession {
  loadMedia(request: unknown): Promise<void>;
}

interface CastContextInstance {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  addEventListener(type: string, handler: (event: { sessionState: string }) => void): void;
  removeEventListener(type: string, handler: (event: { sessionState: string }) => void): void;
  getCurrentSession(): CastSession | null;
}

interface CastFramework {
  CastContext: { getInstance(): CastContextInstance };
  CastContextEventType: { SESSION_STATE_CHANGED: string };
  SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string };
}

const CAST_SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
let sdkScriptRequested = false;

export function CastButton({
  videoId,
  title,
  artworkUrl,
}: {
  videoId: string;
  title: string;
  artworkUrl?: string;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function initialize() {
      const framework = window.cast?.framework;
      const castMedia = window.chrome?.cast?.media;
      if (!framework || !castMedia) return;
      framework.CastContext.getInstance().setOptions({
        receiverApplicationId: castMedia.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: "origin_scoped",
      });
      setReady(true);
    }

    if (window.cast?.framework) {
      initialize();
      return;
    }

    window.__onGCastApiAvailable = (isAvailable) => {
      if (isAvailable) initialize();
    };

    if (!sdkScriptRequested) {
      sdkScriptRequested = true;
      const script = document.createElement("script");
      script.src = CAST_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  async function loadMediaOnSession(session: CastSession, castMedia: ChromeCastNamespace["media"]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/downloads/${videoId}?platform=web`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string" || !data.url) {
        throw new Error(data.error ?? "This video isn't available to cast right now.");
      }

      const mediaInfo = new castMedia.MediaInfo(data.url, "video/mp4");
      const metadata = new castMedia.GenericMediaMetadata();
      metadata.title = title;
      if (artworkUrl) metadata.images = [{ url: artworkUrl }];
      mediaInfo.metadata = metadata;

      await session.loadMedia(new castMedia.LoadRequest(mediaInfo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start casting.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !window.cast?.framework || !window.chrome?.cast?.media) return;
    const framework: CastFramework = window.cast.framework;
    const castMedia: ChromeCastNamespace["media"] = window.chrome.cast.media;
    const context = framework.CastContext.getInstance();

    function onSessionStateChanged(event: { sessionState: string }) {
      const { SESSION_STARTED, SESSION_RESUMED } = framework.SessionState;
      if (event.sessionState !== SESSION_STARTED && event.sessionState !== SESSION_RESUMED) return;
      const session = context.getCurrentSession();
      if (session) void loadMediaOnSession(session, castMedia);
    }

    context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged);
    return () => context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMediaOnSession closes over videoId/title/artworkUrl, all stable for a given video
  }, [ready, videoId, title, artworkUrl]);

  if (!ready) return null;

  return (
    <div className="flex flex-col gap-1">
      {/* google-cast-launcher is a custom element the Cast Framework registers
          itself once loaded; clicking it opens the native device picker and
          starts a session, which the effect above then loads media onto. */}
      <google-cast-launcher
        style={{ width: 24, height: 24, display: "inline-block" }}
        aria-label="Cast to TV"
      />
      {loading && <p className="text-xs text-ter">Starting cast…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
