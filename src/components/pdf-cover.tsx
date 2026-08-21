"use client";

import { useEffect, useRef, useState } from "react";
import { fileContentUrl, getPdfjs } from "@/lib/pdf-client";

type Phase = "waiting" | "rendering" | "done" | "failed";

/**
 * A book cover drawn from the PDF's own first page, so a hymnal book needs
 * no separately uploaded cover image.
 *
 * Rendering is deferred until the card is near the viewport: a category can
 * hold a dozen books, and opening a dozen PDFs on page load — even chunked
 * over range requests — is far more work than a grid of covers is worth.
 * A failure is silent by design; the caller's title placeholder shows
 * through underneath, which is a fine cover and not worth an error state.
 */
export function PdfCover({ fileId }: { fileId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    if (phase !== "waiting") return;
    const element = containerRef.current;
    if (!element) return;

    // No IntersectionObserver (older browsers, jsdom) means no way to know
    // when this scrolls in — render right away rather than never.
    if (typeof IntersectionObserver === "undefined") {
      setPhase("rendering");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setPhase("rendering");
        }
      },
      // Starts a little before the card is actually on screen, so a cover is
      // usually drawn by the time it's scrolled to.
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    if (phase !== "rendering") return;
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const pdfjs = await getPdfjs();
        const loadingTask = pdfjs.getDocument({ url: fileContentUrl(fileId), withCredentials: true });
        task = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;

        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        // Sized from the card's own width so the bitmap matches what's shown
        // rather than being scaled up from a fixed guess.
        const ratio = window.devicePixelRatio || 1;
        const targetWidth = (containerRef.current?.clientWidth || 240) * ratio;
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: targetWidth / natural.width });

        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) setPhase("done");
      } catch {
        if (!cancelled) setPhase("failed");
      } finally {
        void task?.destroy();
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [phase, fileId]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        aria-hidden
        // object-cover crops the page to the card's aspect instead of
        // letterboxing it, matching how an uploaded cover image behaves.
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          phase === "done" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
