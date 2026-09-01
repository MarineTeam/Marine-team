"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { directionOf, firstFocusable, isBackKey, isSelectKey, move, type Position } from "@/lib/tv-nav";

export type TvRow = {
  title: string;
  items: { id: string; title: string; subtitle: string | null; thumbnailUrl: string; embedUrl: string }[];
};

/**
 * The ten-foot screen.
 *
 * Everything about this is different from the rest of the app because the
 * viewer is across a room holding a remote: type is large, the focused item is
 * obvious from six feet away, and there is no pointer - so focus is a position
 * this component keeps and every arrow key is a move from it.
 *
 * A note on the margins: televisions overscan, and the outer few per cent of
 * the picture is genuinely not visible on some sets. Hence the padding, which
 * looks excessive on a monitor and is right on a television.
 */
export function TvShell({ rows, siteName }: { rows: TvRow[]; siteName: string }) {
  const shape = useMemo(() => rows.map((row) => row.items.length), [rows]);
  const [at, setAt] = useState<Position>(() => firstFocusable(shape));
  const [playing, setPlaying] = useState<TvRow["items"][number] | null>(null);
  const focused = useRef<HTMLButtonElement | null>(null);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (playing) {
        if (isBackKey(event.key)) {
          event.preventDefault();
          setPlaying(null);
        }
        return;
      }

      const direction = directionOf(event.key);
      if (direction) {
        event.preventDefault();
        setAt((current) => move(shape, current, direction));
        return;
      }
      if (isSelectKey(event.key)) {
        event.preventDefault();
        const item = rows[at.row]?.items[at.column];
        if (item) setPlaying(item);
      }
    },
    [at, playing, rows, shape],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // The page underneath must not scroll behind this, or a remote's arrows
  // move two things at once.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Scroll the focused tile into view rather than letting focus walk off the
  // edge of the screen - on a television there is no scrollbar to notice.
  useEffect(() => {
    focused.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [at]);

  if (playing) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <iframe
          src={playing.embedUrl}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-6 py-2 text-lg text-white/80">
          Press Back to return
        </p>
      </div>
    );
  }

  return (
    // Covers the app's sidebar, header and footer rather than removing them,
    // the way presenter mode does: a remote cannot use any of that chrome, and
    // on a television it would eat a fifth of the screen. Same trick, same
    // reason, and no restructuring of the root layout to achieve it.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black text-white">
      {/* Overscan margin: the outer few per cent of a television picture is
          genuinely not visible on some sets. */}
      <div className="px-[5vw] py-[4vh]">
        <h1 className="mb-8 text-4xl font-bold tracking-tight">{siteName}</h1>

        {rows.length === 0 && (
          <p className="text-2xl text-white/60">Nothing to watch yet.</p>
        )}

        <div className="space-y-10">
          {rows.map((row, rowIndex) => (
            <section key={row.title}>
              <h2 className="mb-3 text-xl font-medium text-white/70">{row.title}</h2>
              {/* The negative margin gives the focused tile's scale somewhere
                  to grow into: without it the first tile in a row is clipped
                  by the scroller's own edge. */}
              <div className="no-scrollbar -mx-3 flex gap-5 overflow-x-auto px-3 py-3">
                {row.items.map((item, columnIndex) => {
                  const isFocused = at.row === rowIndex && at.column === columnIndex;
                  return (
                    <button
                      key={item.id}
                      ref={isFocused ? focused : null}
                      onClick={() => {
                        setAt({ row: rowIndex, column: columnIndex });
                        setPlaying(item);
                      }}
                      className={`w-[22vw] shrink-0 text-left transition-transform ${
                        isFocused ? "scale-105" : "opacity-70"
                      }`}
                    >
                      <div
                        className={`aspect-video overflow-hidden rounded-lg bg-white/10 ${
                          // A thick, high-contrast ring rather than a subtle
                          // one: this has to be obvious from six feet away.
                          isFocused ? "ring-4 ring-white" : ""
                        }`}
                      >
                        {item.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            // A television may be on a network that can't
                            // reach the image CDN. An empty panel with the
                            // title under it reads as a video; the browser's
                            // broken-image icon reads as a broken site.
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                      </div>
                      <p className="mt-2 truncate text-lg">{item.title}</p>
                      {item.subtitle && (
                        <p className="truncate text-sm text-white/50">{item.subtitle}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
