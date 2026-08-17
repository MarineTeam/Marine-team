"use client";

import { useEffect, useState } from "react";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";

/**
 * The downloads section: the network preference, which is stored now, and the
 * download list, which is a placeholder until offline playback ships.
 *
 * The preference is deliberately live rather than waiting for the feature —
 * it's per-device (see device-settings.ts), so a member setting it on their
 * phone today is exactly the answer the downloader will need later, and
 * asking now avoids a surprise data-plan charge the first time it works.
 */
export function DownloadsManager() {
  const [overCellular, setOverCellular] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverCellular(readDeviceSettings().downloadOverCellular);
    setReady(true);
  }, []);

  function change(value: boolean) {
    setOverCellular(value);
    writeDeviceSettings({ downloadOverCellular: value });
  }

  return (
    <div className="space-y-6">
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
              onChange={() => change(false)}
            />
            <span>
              Wi-Fi only
              <span className="block text-xs text-zinc-500">Downloads wait until you&apos;re on Wi-Fi.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="download-network"
              className="mt-1"
              checked={overCellular}
              onChange={() => change(true)}
            />
            <span>
              Wi-Fi or mobile data
              <span className="block text-xs text-zinc-500">
                Downloads start anywhere. This can use a lot of data.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="text-xs text-zinc-500">Applies to this device only.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Manage downloads</h3>
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="text-sm font-medium">No downloads on this device</p>
          <p className="mt-1 text-xs text-zinc-500">
            Downloading videos for offline playback isn&apos;t available yet. When it is, anything you&apos;ve saved
            will be listed here with the space it uses and a way to remove it.
          </p>
        </div>
      </section>
    </div>
  );
}
