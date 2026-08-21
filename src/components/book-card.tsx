"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { countOutlineLeaves, fileContentUrl, openPdfMetadataTask } from "@/lib/pdf-client";

export type BookCardData = {
  href: string;
  title: string;
  /** Short badge like "GSFH1" — a series' abbreviation; a bare PDF has none. */
  badge: string | null;
  locked: boolean;
  /** An uploaded cover, which wins over everything below. */
  coverImageUrl: string | null;
  /** A cover already derived from the PDF and stored on the row — see "Generate covers". */
  coverDataUrl: string | null;
  /** The PDF to fall back to, drawing the cover and counting hymns live; null when there's nothing to read. */
  coverFileId: string | null;
  /** Pre-computed subtitle (e.g. "13 books"); when null a hymn count is used instead. */
  subtitle: string | null;
  /** A hymn count already derived and stored, used when `subtitle` is null. */
  hymnCount: number | null;
};

// A small fixed palette rather than an arbitrary hash-to-hue: keeps every
// badge legible (white on a dark enough color) instead of risking a random
// pale one that washes out.
const BADGE_COLORS = [
  "#00897B",
  "#F8961E",
  "#5C6BC0",
  "#D81B60",
  "#43A047",
  "#6D4C41",
  "#546E7A",
  "#8E24AA",
];

function badgeColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

/**
 * One book in a hymnal grid.
 *
 * Where a cover or a hymn count isn't already known, both are taken from
 * the book's own PDF — opened once for the pair, and only when the card
 * nears the viewport, since a category can hold a dozen books and opening
 * a dozen PDFs on load is far more work than a grid of covers is worth.
 * Failure is silent: the titled placeholder underneath is a fine cover,
 * and a missing count is not worth an error.
 */
export function BookCard({ book }: { book: BookCardData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [hymnCount, setHymnCount] = useState<number | null>(null);

  // The PDF is opened only for what isn't already known. A book an admin
  // has generated needs nothing at all, which is the whole point of storing
  // these — see derivePdfBookCard.
  const storedCover = book.coverImageUrl ?? book.coverDataUrl;
  const readable = Boolean(book.coverFileId) && !book.locked;
  const needsCover = readable && !storedCover;
  const needsCount = readable && book.subtitle === null && book.hymnCount === null;

  useEffect(() => {
    if (visible || (!needsCover && !needsCount)) return;
    const element = containerRef.current;
    if (!element) return;

    // No IntersectionObserver (older browsers, jsdom) means no way to know
    // when this scrolls in — draw right away rather than never.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setVisible(true);
        }
      },
      // Starts a little before the card is actually on screen, so a cover is
      // usually drawn by the time it's scrolled to.
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, needsCover, needsCount]);

  useEffect(() => {
    const fileId = book.coverFileId;
    if (!visible || !fileId || (!needsCover && !needsCount)) return;

    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const loadingTask = await openPdfMetadataTask(fileContentUrl(fileId));
        task = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;

        if (needsCover) {
          const page = await doc.getPage(1);
          const canvas = canvasRef.current;
          if (canvas && !cancelled) {
            // Sized from the card's own width so the bitmap matches what's
            // shown rather than being scaled up from a fixed guess.
            const ratio = window.devicePixelRatio || 1;
            const targetWidth = (containerRef.current?.clientWidth || 240) * ratio;
            const natural = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: targetWidth / natural.width });
            const context = canvas.getContext("2d");
            if (context) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              if (!cancelled) setDrawn(true);
            }
          }
        }

        if (needsCount && !cancelled) {
          // Counted off the raw outline rather than the resolved one: a
          // card needs the number, not the page each hymn is on, and
          // resolving destinations is what costs the round trips.
          const outline = await doc.getOutline();
          const count = outline ? countOutlineLeaves(outline) : 0;
          if (!cancelled && count > 0) setHymnCount(count);
        }
      } catch {
        // Silent by design — see the component note.
      } finally {
        void task?.destroy();
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [visible, needsCover, needsCount, book.coverFileId]);

  const count = book.hymnCount ?? hymnCount;
  const subtitle =
    book.subtitle ?? (count === null ? null : `${count} ${count === 1 ? "hymn" : "hymns"}`);

  return (
    <Link href={book.href} className="group flex flex-col gap-1.5">
      <div
        ref={containerRef}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-lg dark:bg-zinc-800"
      >
        {/* Shows through until a cover arrives, and stays put when one can't
            be drawn — a titled card is a fine cover on its own. */}
        <div className="flex h-full items-center justify-center p-3 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {book.title}
        </div>

        {book.coverImageUrl ? (
          // unoptimized: a cover is a freeform admin-pasted URL on any host
          // — see next.config.ts and MenuTile's matching note.
          <Image src={book.coverImageUrl} alt="" fill unoptimized className="object-cover" />
        ) : book.coverDataUrl ? (
          // A plain img, not next/image, because next/image's src is a URL
          // or path and doesn't reliably take a data: URI. Nothing is lost:
          // an inline image has no network fetch for Next to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          needsCover && (
            <canvas
              ref={canvasRef}
              aria-hidden
              // object-fit applies to canvas, so the page crops to the card's
              // aspect instead of letterboxing — matching an uploaded cover.
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                drawn ? "opacity-100" : "opacity-0"
              }`}
            />
          )
        )}

        {book.badge && (
          <span
            className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
            style={{ backgroundColor: badgeColor(book.badge) }}
          >
            {book.badge}
          </span>
        )}
        {book.locked && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Members
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-snug group-hover:underline">{book.title}</p>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
    </Link>
  );
}
