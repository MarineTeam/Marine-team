"use client";

import { useCallback, useEffect, useState } from "react";

type Device = {
  id: string;
  deviceName: string;
  deviceKind: string | null;
  linkedAt: string | null;
  lastSeenAt: string | null;
};

/**
 * The televisions signed in to this account, and the button that signs one out.
 *
 * Worth its own screen because a television token does not expire: it sits in
 * a room the member may not be in any more, and this is the only way back.
 */
export function TvDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/profile/devices");
    if (response.ok) setDevices((await response.json()).devices);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function revoke(device: Device) {
    if (!window.confirm(`Sign "${device.deviceName}" out?`)) return;
    const response = await fetch(`/api/profile/devices/${device.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  if (loaded && devices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
        No televisions are signed in.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-sep rounded-lg border border-sep">
      {devices.map((device) => (
        <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">{device.deviceName}</p>
            <p className="text-xs text-sec">
              {[
                device.deviceKind,
                device.linkedAt
                  ? `signed in ${new Date(device.linkedAt).toLocaleDateString("en-GB")}`
                  : null,
                device.lastSeenAt
                  ? `last used ${new Date(device.lastSeenAt).toLocaleDateString("en-GB")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" - ")}
            </p>
          </div>
          <button
            onClick={() => revoke(device)}
            className="shrink-0 rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
          >
            Sign out
          </button>
        </li>
      ))}
    </ul>
  );
}
