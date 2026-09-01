"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEVICE_SETTINGS_EVENT,
  MAX_READING_SCALE,
  MIN_READING_SCALE,
  READING_SCALE_STEP,
  readDeviceSettings,
  writeDeviceSettings,
} from "@/lib/device-settings";

/**
 * The reading text size, kept per device and shared across everything that
 * shows a body of text to read.
 *
 * A hook rather than a prop threaded down, because the size is set in one
 * place and read in several — a hymn's lyrics, an EPUB's pages, the settings
 * page — and a change in any of them should reach the others without a
 * reload. The device-settings event is what carries that.
 */
export function useReadingScale(): [number, (next: number) => void] {
  // Starts at the default rather than reading storage during render: this is
  // rendered on the server too, and a value read there would be the wrong
  // device's.
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const read = () => setScale(readDeviceSettings().readingTextScale);
    read();
    window.addEventListener(DEVICE_SETTINGS_EVENT, read);
    return () => window.removeEventListener(DEVICE_SETTINGS_EVENT, read);
  }, []);

  const set = useCallback((next: number) => {
    const clamped = Math.min(MAX_READING_SCALE, Math.max(MIN_READING_SCALE, next));
    // Floated arithmetic on tenths lands on 1.2000000000000002, which then
    // reads back as a size nobody chose.
    const rounded = Math.round(clamped * 100) / 100;
    setScale(rounded);
    writeDeviceSettings({ readingTextScale: rounded });
  }, []);

  return [scale, set];
}

/**
 * A− and A+, for the text somebody is reading right now.
 *
 * Beside the words rather than only in settings: the moment you know a hymn
 * is too small to read is while you are looking at it, and a church hall is
 * not where anybody goes hunting through a settings page.
 */
export function ReadingSizeControls({
  scale,
  onChange,
  className = "",
}: {
  scale: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(scale - READING_SCALE_STEP)}
        disabled={scale <= MIN_READING_SCALE}
        aria-label="Smaller text"
        className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover disabled:opacity-40"
      >
        A−
      </button>
      <button
        type="button"
        onClick={() => onChange(scale + READING_SCALE_STEP)}
        disabled={scale >= MAX_READING_SCALE}
        aria-label="Larger text"
        className="rounded-md border border-sep px-2 py-1 text-sm hover:bg-hover disabled:opacity-40"
      >
        A+
      </button>
      {/* Only once it isn't the default: a number beside the words is noise
          until somebody has changed it and wants to know where they are. */}
      {scale !== 1 && (
        <button
          type="button"
          onClick={() => onChange(1)}
          className="rounded-md border border-sep px-2 py-1 text-xs text-sec hover:bg-hover"
        >
          {Math.round(scale * 100)}% · reset
        </button>
      )}
    </div>
  );
}
