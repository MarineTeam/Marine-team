"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DOWNLOADS_CHANGED_EVENT,
  formatBytes,
  reconcileDownloads,
} from "@/lib/offline-downloads";
import { OFFLINE_BOOKS_CHANGED_EVENT, reconcileOfflineBooks } from "@/lib/offline-books";

/**
 * What this device is holding, videos and books together.
 *
 * They were counted separately, which made the number meaningless: a hymnal
 * is routinely the largest thing on a phone, and the bar that claimed to show
 * how full the device was ignored it entirely. One total, one bar, with the
 * split underneath — because "3.1 GB of a suggested 4" is only useful if it
 * covers everything that is actually there.
 *
 * The cap is the admin's suggestion (see /admin/downloads), not a limit
 * anything enforces; the browser's own quota is the real one, and it is shown
 * beside it where the browser will say what it is.
 */
export function DeviceStorage({ maxDeviceGb }: { maxDeviceGb: number }) {
  const [videoBytes, setVideoBytes] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [bookBytes, setBookBytes] = useState(0);
  const [bookCount, setBookCount] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [videos, books] = await Promise.all([reconcileDownloads(), reconcileOfflineBooks()]);
    setVideoBytes(videos.reduce((total, item) => total + item.bytes, 0));
    setVideoCount(videos.length);
    setBookBytes(books.reduce((total, item) => total + item.bytes, 0));
    setBookCount(books.length);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Either manager removing something changes this total, and both announce
    // it the same way.
    window.addEventListener(DOWNLOADS_CHANGED_EVENT, refresh);
    window.addEventListener(OFFLINE_BOOKS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(DOWNLOADS_CHANGED_EVENT, refresh);
      window.removeEventListener(OFFLINE_BOOKS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  useEffect(() => {
    // What the browser will actually allow, which is the limit that bites —
    // and which several browsers decline to estimate at all.
    void navigator.storage
      ?.estimate?.()
      .then((estimate) => setQuotaBytes(estimate.quota ?? null))
      .catch(() => setQuotaBytes(null));
  }, []);

  const usedBytes = videoBytes + bookBytes;
  const usedFraction = Math.min(1, usedBytes / (maxDeviceGb * 1024 ** 3));

  if (usedBytes === 0) {
    return (
      <p className="text-xs text-sec">
        Nothing saved on this device yet. Videos and books you save are kept here, up to a suggested{" "}
        {maxDeviceGb} GB.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-chip">
        <div className="h-full bg-accent" style={{ width: `${Math.round(usedFraction * 100)}%` }} />
      </div>
      <p className="text-xs text-sec">
        {formatBytes(usedBytes)} used of a suggested {maxDeviceGb} GB
        {videoCount > 0 && ` · ${videoCount} video${videoCount === 1 ? "" : "s"} ${formatBytes(videoBytes)}`}
        {bookCount > 0 && ` · ${bookCount} book${bookCount === 1 ? "" : "s"} ${formatBytes(bookBytes)}`}
      </p>
      {quotaBytes !== null && (
        <p className="text-xs text-ter">
          This browser allows about {formatBytes(quotaBytes)} for the whole site — the suggested figure
          above is the church&apos;s guidance, not a limit.
        </p>
      )}
    </div>
  );
}
