"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeepAwake } from "@/components/keep-awake";
import {
  MAX_PRESENT_SCALE,
  MIN_PRESENT_SCALE,
  readDeviceSettings,
  writeDeviceSettings,
} from "@/lib/device-settings";
import { verseHeading, type Verse } from "@/lib/verses";

export type PresentNeighbour = { href: string; title: string; number: number | null } | null;

/**
 * A hymn on the wall.
 *
 * This is the screen at the front of the room, not a page of the app, so it
 * covers the app rather than sitting inside it: a fixed overlay above the
 * header, the rail and the tab bar. A route group with its own root layout
 * would be the tidier way to escape that chrome and would mean moving every
 * other route into a group to do it — a lot of churn for a view whose whole
 * job is to paint over what's underneath anyway.
 *
 * One verse at a time, as large as it will go, and everything else out of the
 * way: the controls fade out on their own and come back on the first touch,
 * key or nudge of the mouse. A presenter's clicker sends PageDown/PageUp, so
 * those move a verse exactly as the arrows do.
 */
export function Presenter({
  title,
  subtitle,
  copyright,
  verses,
  backHref,
  previous,
  next,
}: {
  title: string;
  subtitle: string | null;
  /**
   * The song's copyright line. Shown small and permanently at the foot of the
   * screen — not with the controls, which fade after three seconds — because
   * a licence requires it to be visible *while the words are*, and something
   * that disappears on its own does not meet that.
   */
  copyright: string | null;
  verses: Verse[];
  /** Where leaving goes: the hymn's own page, or the service it belongs to. */
  backHref: string;
  /** The hymns either side in a service, when presenting one. */
  previous: PresentNeighbour;
  next: PresentNeighbour;
}) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [scale, setScale] = useState(1);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [controlsShown, setControlsShown] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const settings = readDeviceSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScale(settings.presentTextScale);
    setTheme(settings.presentTheme);
  }, []);

  // Nothing behind this should scroll while it is up.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const step = useCallback(
    (by: 1 | -1) => {
      setAt((current) => {
        const to = current + by;
        if (to >= 0 && to < verses.length) return to;
        // Past either end, a service carries on into the hymn either side —
        // which is the whole point of presenting from a plan rather than a
        // hymn at a time.
        const neighbour = by === 1 ? next : previous;
        if (neighbour) router.push(neighbour.href);
        return current;
      });
    },
    [verses.length, next, previous, router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // A clicker is a keyboard: most send PageDown/PageUp, some send the
      // arrows, and the space bar is what a person reaches for.
      if ([" ", "ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) {
        step(1);
        event.preventDefault();
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        step(-1);
        event.preventDefault();
      } else if (event.key === "Home") {
        setAt(0);
      } else if (event.key.toLowerCase() === "f") {
        void toggleFullscreen();
      }
      setControlsShown(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  // The controls are chrome on a wall: shown when something happens, gone
  // again a few seconds later.
  useEffect(() => {
    if (!controlsShown) return;
    const timer = setTimeout(() => setControlsShown(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsShown, at]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Refused (an iframe, an older iOS); the overlay is already covering
      // everything the app draws, which is most of the benefit.
    }
  }

  function nudgeScale(by: number) {
    const next = Math.min(MAX_PRESENT_SCALE, Math.max(MIN_PRESENT_SCALE, Number((scale + by).toFixed(2))));
    setScale(next);
    writeDeviceSettings({ presentTextScale: next });
  }

  function flipTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeDeviceSettings({ presentTheme: next });
  }

  const verse = verses[at];
  const dark = theme === "dark";
  const controlClass = `rounded-md border px-2.5 py-1.5 text-sm ${
    dark ? "border-white/30 text-white hover:bg-white/10" : "border-black/30 text-black hover:bg-black/5"
  }`;

  return (
    <div
      // Above the tab bar (z-30) and everything else the app draws.
      className={`fixed inset-0 z-50 flex flex-col ${dark ? "bg-black text-white" : "bg-white text-black"}`}
      onMouseMove={() => setControlsShown(true)}
      onTouchStart={() => setControlsShown(true)}
    >
      <KeepAwake />

      {/* The words. Tapping the right half moves on, the left half back —
          the whole surface is the control, because whoever is driving is
          standing at a laptop three feet away and not looking at it. */}
      <div className="relative flex min-h-0 flex-1">
        <button
          onClick={() => step(-1)}
          aria-label="Previous"
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize"
        />
        <button
          onClick={() => step(1)}
          aria-label="Next"
          className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-e-resize"
        />

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-8 text-center">
          {verse ? (
            <>
              <p
                className={`mb-4 text-sm tracking-[0.18em] uppercase ${dark ? "text-white/50" : "text-black/50"}`}
              >
                {verseHeading(verse)}
              </p>
              <p
                // Sized against the viewport, then nudged: what fits a phone
                // and what fills a hall are the same words at very different
                // sizes, and only the room can say which.
                style={{ fontSize: `calc(clamp(1.5rem, 4.2vw + 1.2vh, 4.5rem) * ${scale})` }}
                className="max-w-6xl leading-[1.25] font-semibold text-balance whitespace-pre-line"
              >
                {verse.lines.join("\n")}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-semibold">{title}</p>
              <p className={`mt-3 text-lg ${dark ? "text-white/60" : "text-black/60"}`}>
                No lyrics have been saved for this hymn, so there is nothing to put on the screen.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Everything else, out of the way until it's wanted. */}
      <div
        // Above the tap zones below, which cover the whole surface: without
        // this, pressing "Done" or "Light" would turn the page instead — the
        // zone is invisible, so there would be nothing to see wrong.
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 transition-opacity duration-300 ${
          controlsShown ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto min-w-0">
          <p className="truncate text-base font-medium">{title}</p>
          {subtitle && <p className={`truncate text-sm ${dark ? "text-white/60" : "text-black/60"}`}>{subtitle}</p>}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => nudgeScale(-0.1)} className={controlClass} aria-label="Smaller text">
            A−
          </button>
          <button onClick={() => nudgeScale(0.1)} className={controlClass} aria-label="Bigger text">
            A+
          </button>
          <button onClick={flipTheme} className={controlClass}>
            {dark ? "Light" : "Dark"}
          </button>
          <button onClick={() => void toggleFullscreen()} className={controlClass}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <a href={backHref} className={controlClass}>
            Done
          </a>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-5 z-20 flex items-center justify-between gap-3 p-4 text-sm transition-opacity duration-300 ${
          controlsShown ? "opacity-100" : "opacity-0"
        } ${dark ? "text-white/60" : "text-black/60"}`}
      >
        <span className="pointer-events-auto">
          {verses.length > 0 ? `${at + 1} of ${verses.length}` : ""}
          {previous && ` · back: ${previous.title}`}
        </span>
        <span className="pointer-events-auto truncate">{next ? `next: ${next.title}` : ""}</span>
      </div>

      {/* Always on, unlike everything else here. See the prop's note: a
          copyright line that fades out after three seconds is not a
          copyright line that was shown. */}
      {copyright && (
        <p
          className={`pointer-events-none absolute inset-x-0 bottom-0 truncate px-4 pb-1 text-center text-xs ${
            dark ? "text-white/40" : "text-black/40"
          }`}
        >
          {copyright}
        </p>
      )}
    </div>
  );
}
