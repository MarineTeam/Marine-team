"use client";

import { useCallback, useRef, useState } from "react";
import { fileContentUrl, getPdfjs } from "@/lib/pdf-client";
import { MIN_TEXT_LAYER_CHARS, OCR_SCALE, startOcr, type OcrWorker } from "@/lib/ocr-client";

/** Pages per request. Small enough that a stopped run loses seconds, not minutes. */
const BATCH = 10;

type Progress = { at: number; of: number; ocr: number; page: number };

/**
 * Reads a book's pages for their text, so a scanned hymnal can be searched.
 *
 * Two ways in, in order of preference. A PDF made by a typesetter carries a
 * text layer, which is exact and instant. A PDF made by a scanner carries
 * photographs, and the only way to the words is to look at them — OCR, which
 * is seconds a page and where the hour goes.
 *
 * Deliberately resumable and deliberately interruptible: an hour is long
 * enough that a laptop will sleep, and losing the run to that would mean
 * nobody ever finishes a book. Pages are stored in tens as they are read,
 * and starting again picks up from the first page not yet held.
 *
 * Runs in the admin's browser like the cover pass, and for the same reason:
 * pdf.js and the OCR engine both live there, and neither belongs in a
 * serverless function with a request timeout.
 */
export function BookTextReader({
  file,
}: {
  file: { id: string; title: string; textIndexedAt: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState<{ done: number; ocr: number; finished: string | null } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Read inside the loop rather than through state, which the loop's own
  // closure would have captured at the render it started in.
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/text`);
      if (!res.ok) throw new Error("Couldn't check what's been read");
      const data = await res.json();
      setHeld({ done: data.done.length, ocr: data.ocrPages, finished: data.textIndexedAt });
      return data.done as number[];
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't check what's been read");
      return null;
    }
  }, [file.id]);

  async function run() {
    const alreadyDone = await load();
    if (alreadyDone === null) return;

    setBusy(true);
    setResult(null);
    setError(null);
    stopRef.current = false;

    const done = new Set(alreadyDone);
    let ocr: OcrWorker | null = null;
    let ocrCount = 0;
    let stoppedEarly = false;

    try {
      const pdfjs = await getPdfjs();
      const task = pdfjs.getDocument({ url: fileContentUrl(file.id), withCredentials: true });
      const doc = await task.promise;

      try {
        let batch: { page: number; text: string; source: "text" | "ocr" }[] = [];

        const send = async (finished: boolean) => {
          if (batch.length === 0 && !finished) return;
          const res = await fetch(`/api/admin/files/${file.id}/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pages: batch, finished }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't store what was read");
          batch = [];
        };

        for (let page = 1; page <= doc.numPages; page++) {
          if (stopRef.current) {
            stoppedEarly = true;
            break;
          }
          setProgress({ at: page, of: doc.numPages, ocr: ocrCount, page });
          if (done.has(page)) continue;

          const loaded = await doc.getPage(page);
          const content = await loaded.getTextContent();
          const layer = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

          if (layer.length >= MIN_TEXT_LAYER_CHARS) {
            batch.push({ page, text: layer, source: "text" });
          } else {
            // Started only when a page actually needs it: a typeset book
            // never pays the engine's several megabytes or its startup.
            ocr ??= await startOcr();
            const viewport = loaded.getViewport({ scale: OCR_SCALE });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Couldn't draw the page to read it");
            await loaded.render({ canvas, canvasContext: context, viewport }).promise;

            const read = await ocr.read(canvas);
            ocrCount += 1;
            batch.push({ page, text: read.replace(/\s+/g, " ").trim(), source: "ocr" });
            // A rendered page at OCR scale is tens of megabytes of canvas;
            // six hundred of them left to the collector is a tab that dies
            // halfway through a book.
            canvas.width = 0;
            canvas.height = 0;
          }

          if (batch.length >= BATCH) await send(false);
        }

        // Only a run that reached the last page has read the book; one that
        // was stopped leaves it unfinished, so the button still offers to
        // carry on rather than claiming the book is done.
        await send(!stoppedEarly);
      } finally {
        void task.destroy();
      }

      setResult(
        stoppedEarly
          ? "Stopped — what was read is kept, and starting again carries on from there."
          : `Read ${doc.numPages} pages${ocrCount > 0 ? `, ${ocrCount} of them by OCR` : ""}.`,
      );
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Couldn't read this book");
    } finally {
      await ocr?.stop();
      setProgress(null);
      setBusy(false);
      await load();
    }
  }

  async function clear() {
    if (!window.confirm(`Throw away the text read from “${file.title}”?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/files/${file.id}/text`, { method: "DELETE" });
      setResult(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="rounded-md border border-sep px-3 py-1.5 text-xs"
      >
        {file.textIndexedAt ? "Text read ✓" : "Read this book's text…"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-sep p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Book text</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-xs text-sec hover:underline disabled:opacity-50"
        >
          Close
        </button>
      </div>

      <p className="text-xs text-sec">
        Reads every page for its words, so searching inside this book finds them. A book that
        carries its own text is read in seconds; a scan has to be looked at instead, which takes a
        few seconds a page — leave the tab open, and stop whenever you like. What has been read is
        kept, and starting again carries on from where it stopped.
      </p>

      {held && (
        <p className="text-xs text-sec">
          {held.done === 0
            ? "Nothing read yet."
            : `${held.done} pages held${held.ocr > 0 ? `, ${held.ocr} of them read by OCR` : ""}${
                held.finished ? " — finished" : " — unfinished"
              }.`}
        </p>
      )}

      {progress && (
        <p className="text-xs text-sec">
          Page {progress.at} of {progress.of}
          {progress.ocr > 0 && ` · ${progress.ocr} read by OCR`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {busy ? (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="rounded-md border border-sep px-3 py-1.5"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            className="rounded-md btn-primary px-3 py-1.5 text-white"
          >
            {held && held.done > 0 && !held.finished ? "Carry on reading" : "Read this book"}
          </button>
        )}
        {held && held.done > 0 && !busy && (
          <button type="button" onClick={() => void clear()} className="text-sec hover:underline">
            Throw it away
          </button>
        )}
        {result && <span className="text-green-600">{result}</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
