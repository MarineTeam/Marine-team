"use client";

import { ReadingSizeControls, useReadingScale } from "@/components/reading-size";

/** The size the lyrics were before this was adjustable, and what 100% means. */
const BASE_PX = 15;

/**
 * A hymn's words, at whatever size this device reads them.
 *
 * The controls sit with the words rather than only in settings, because the
 * moment anybody discovers a hymn is too small is while they are looking at
 * it — in a pew, halfway through the first verse, which is not when somebody
 * goes hunting through a settings page.
 */
export function LyricsText({ text }: { text: string }) {
  const [scale, setScale] = useReadingScale();

  return (
    <div className="space-y-2">
      <ReadingSizeControls scale={scale} onChange={setScale} className="no-print justify-end" />
      <div
        style={{ fontSize: `${BASE_PX * scale}px` }}
        className="whitespace-pre-wrap rounded-lg border border-sep p-5 leading-relaxed"
      >
        {text}
      </div>
    </div>
  );
}
