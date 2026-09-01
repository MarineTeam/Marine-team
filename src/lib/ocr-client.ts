"use client";

/**
 * Reading the words off a page that is a photograph.
 *
 * A PDF from a typesetter carries its text; a PDF from a scanner carries
 * pictures of text, and everything the reader builds on words — search in
 * the book, read aloud — quietly does nothing on one. Most hymnals in this
 * app are scans, so "search inside the book" has never worked where it would
 * be most useful.
 *
 * OCR is the answer and it is slow: seconds a page, an hour for a hymnal.
 * That cost is paid once, by an admin, and the result is stored (see
 * BookPage) — never by somebody looking a hymn up.
 *
 * The engine is served from this app's own `/tesseract` rather than
 * tesseract.js's default CDN — see scripts/copy-offline-viewers.mjs.
 */

/** Where the vendored engine lives; every path below is under it. */
const ENGINE = "/tesseract";

export type OcrWorker = {
  read: (image: Blob | HTMLCanvasElement) => Promise<string>;
  stop: () => Promise<void>;
};

/**
 * Starts one OCR worker, to be reused for every page of a book.
 *
 * Starting one costs a few seconds and several megabytes of wasm; doing it
 * per page would dwarf the recognition itself.
 */
export async function startOcr(onProgress?: (fraction: number) => void): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    workerPath: `${ENGINE}/worker.min.js`,
    // A directory, not a file: the worker feature-detects SIMD support and
    // asks for the core build this browser can actually run.
    corePath: ENGINE,
    langPath: ENGINE,
    gzip: true,
    logger: onProgress
      ? (message: { status: string; progress: number }) => {
          if (message.status === "recognizing text") onProgress(message.progress);
        }
      : undefined,
  });

  return {
    read: async (image) => {
      const { data } = await worker.recognize(image);
      return data.text ?? "";
    },
    stop: async () => {
      await worker.terminate();
    },
  };
}

/**
 * How much text a page has to carry for its own text layer to be believed.
 *
 * A scan is not always empty of text: the scanner's software may leave a
 * stray character, and a page of photographs in an otherwise typeset book
 * genuinely has none. Twenty characters is comfortably below any real page
 * of a hymn and comfortably above both of those.
 */
export const MIN_TEXT_LAYER_CHARS = 20;

/** Rendering scale for OCR: enough resolution to read 8pt type off a scan. */
export const OCR_SCALE = 2;
