/**
 * Copies pdf.js's browser build into `public/pdfjs/`, for the offline shell.
 *
 * The app itself never needs this: it imports pdfjs-dist through the bundler,
 * which keeps the worker version-locked without anything in `public` (see
 * src/lib/pdf-client.ts). But `public/offline.html` is a static file the
 * service worker serves with no network and no bundle, and it has to be able
 * to draw a saved hymnal's pages — so it needs a copy of the library at a
 * URL it can name, cached alongside the book.
 *
 * Copied at install/build time rather than committed, so it stays whatever
 * version package.json pins. Deliberately never fails the build: without it
 * the offline shell falls back to handing the PDF to the browser's own
 * viewer, which is worse but not broken.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "build");
const to = join(root, "public", "pdfjs");

// The minified builds only: these are fetched over a member's connection
// when they first save a book, and the unminified pair is three times the
// size for the same behaviour.
const FILES = ["pdf.min.mjs", "pdf.worker.min.mjs"];

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(to, { recursive: true });
  for (const name of FILES) {
    const source = join(from, name);
    const target = join(to, name);
    const sourceSize = await sizeOf(source);
    if (sourceSize === null) {
      console.warn(`[offline-pdfjs] ${name} not found in pdfjs-dist; offline reading will fall back to the browser's PDF viewer.`);
      continue;
    }
    // Idempotent: this runs on every install and every build, and re-copying
    // 1.7MB each time is noise in the build log for no gain.
    if ((await sizeOf(target)) === sourceSize) continue;
    await copyFile(source, target);
    console.log(`[offline-pdfjs] copied ${name} (${Math.round(sourceSize / 1024)} KB)`);
  }
}

main().catch((error) => {
  console.warn(`[offline-pdfjs] skipped: ${error?.message ?? error}`);
});
