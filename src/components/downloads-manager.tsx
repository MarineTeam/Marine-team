"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";
import {
  DOWNLOADS_CHANGED_EVENT,
  downloadsSupported,
  formatBytes,
  reconcileDownloads,
  removeAllDownloads,
  removeDownload,
  type DownloadedVideo,
} from "@/lib/offline-downloads";

/**
 * The downloads section of the profile: what this device is allowed to do,
 * the network preference, and the files themselves.
 *
 * The list is per device and read straight from Cache Storage — the server
 * never learns what's been downloaded, so it can't render this and doesn't
 * try. Playback is an ordinary `<video>` pointing at the cached URL, which
 * the service worker answers with no network at all.
 *
 * How full the device is lives in DeviceStorage above this, not here: books
 * are kept on the same device out of the same allowance, and a bar that
 * counted only videos said something untrue.
 */
export function DownloadsManager({
  pluginOn,
  permitted,
  platform,
}: {
  pluginOn: boolean;
  permitted: boolean;
  platform: "WEB" | "PWA" | "BOTH";
}) {
  const [overCellular, setOverCellular] = useState(false);
  const [items, setItems] = useState<DownloadedVideo[]>([]);
  const [playing, setPlaying] = useState<DownloadedVideo | null>(null);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);

  const refresh = useCallback(async () => {
    setItems(await reconcileDownloads());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverCellular(readDeviceSettings().downloadOverCellular);
    setSupported(downloadsSupported());
    setReady(true);
    refresh();

    window.addEventListener(DOWNLOADS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOWNLOADS_CHANGED_EVENT, refresh);
  }, [refresh]);

  function changeNetwork(value: boolean) {
    setOverCellular(value);
    writeDeviceSettings({ downloadOverCellular: value });
  }

  async function remove(item: DownloadedVideo) {
    if (playing?.videoId === item.videoId) setPlaying(null);
    await removeDownload(item.videoId);
    await refresh();
  }

  async function clearAll() {
    if (!confirm("Remove every downloaded video from this device?")) return;
    setPlaying(null);
    await removeAllDownloads();
    await refresh();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Availability</h3>
        {!pluginOn ? (
          <p className="text-sm text-sec">Downloads are turned off for this site.</p>
        ) : !permitted ? (
          <p className="text-sm text-sec">
            Your account doesn&apos;t have download access. Ask an admin if you think it should.
          </p>
        ) : !supported ? (
          <p className="text-sm text-sec">
            This browser can&apos;t store downloads. Try installing the app, or use a different browser.
          </p>
        ) : (
          <p className="text-sm text-sec">
            You can download videos for offline viewing
            {platform === "PWA"
              ? " in the installed app"
              : platform === "WEB"
                ? " on the web"
                : " here and in the installed app"}
            . Look for the ⬇ Download button under a video. Individual videos can still be excluded by an admin.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Network</h3>
        <fieldset className="space-y-2 text-sm" disabled={!ready}>
          <legend className="sr-only">When to download</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="download-network"
              className="mt-1"
              checked={!overCellular}
              onChange={() => changeNetwork(false)}
            />
            <span>
              Wi-Fi only
              <span className="block text-xs text-sec">Downloads wait until you&apos;re on Wi-Fi.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="download-network"
              className="mt-1"
              checked={overCellular}
              onChange={() => changeNetwork(true)}
            />
            <span>
              Wi-Fi or mobile data
              <span className="block text-xs text-sec">
                Downloads start anywhere. This can use a lot of data.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="text-xs text-sec">
          Applies to this device only. Detecting a mobile connection isn&apos;t possible in every browser — where
          it isn&apos;t, downloads go ahead.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">On this device</h3>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              className="rounded-md border border-sep px-3 py-1 text-sm hover:bg-hover"
            >
              Remove all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-sep p-6 text-center">
            <p className="text-sm font-medium">Nothing downloaded yet</p>
            <p className="mt-1 text-xs text-sec">
              Downloaded videos are kept on this device and play without a connection.
            </p>
          </div>
        ) : (
          <>

            {playing && (
              <div className="space-y-1">
                {/* Served from Cache Storage by the service worker, so this
                    plays with no connection. */}
                <video src={playing.cacheUrl} controls autoPlay className="w-full rounded-lg bg-black" />
                <div className="flex items-center justify-between text-xs text-sec">
                  <span className="truncate">{playing.title}</span>
                  <button onClick={() => setPlaying(null)} className="underline">
                    Close
                  </button>
                </div>
              </div>
            )}

            <ul className="divide-y divide-sep rounded-lg border border-sep">
              {items.map((item) => (
                <li key={item.videoId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-xs text-sec">
                      {item.seriesTitle ? `${item.seriesTitle} · ` : ""}
                      {formatBytes(item.bytes)} · saved{" "}
                      {new Date(item.downloadedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <button
                      onClick={() => setPlaying(item)}
                      className="rounded-md border border-sep px-3 py-1 hover:bg-hover"
                    >
                      Play offline
                    </button>
                    <Link
                      href={`/videos/${item.videoSlug}`}
                      className="rounded-md border border-sep px-3 py-1 hover:bg-hover"
                    >
                      Open page
                    </Link>
                    <button
                      onClick={() => remove(item)}
                      className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
