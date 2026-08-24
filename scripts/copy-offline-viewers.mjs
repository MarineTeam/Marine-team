/**
 * Copies the two reader libraries' browser builds into `public/`, for the
 * offline shell.
 *
 * The app itself never needs these: it imports both through the bundler,
 * which keeps them version-locked without anything in `public` (see
 * src/lib/pdf-client.ts). But `public/offline.html` is a static file the
 * service worker serves with no network and no bundle, and it has to be able
 * to draw a saved book — so it needs a copy of the library at a URL it can
 * name, cached alongside the book.
 *
 * epub.js comes with JSZip: its dist build is UMD and expects `JSZip` as a
 * global, so the pair travel together or neither works.
 *
 * Copied at install/build time rather than committed, so they stay whatever
 * versions package.json pins. Deliberately never fails the build: without
 * pdf.js the offline shell hands a PDF to the browser's own viewer, which is
 * worse but not broken, and an EPUB simply isn't offered for saving.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const publicDir = join(root, "public");

// The minified builds only: these are fetched over a member's connection
// when they first save a book, and the unminified ones are several times the
// size for the same behaviour.
const FILES = [
  { from: join(modules, "pdfjs-dist", "build", "pdf.min.mjs"), to: join(publicDir, "pdfjs", "pdf.min.mjs") },
  {
    from: join(modules, "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    to: join(publicDir, "pdfjs", "pdf.worker.min.mjs"),
  },
  { from: join(modules, "jszip", "dist", "jszip.min.js"), to: join(publicDir, "epubjs", "jszip.min.js") },
  { from: join(modules, "epubjs", "dist", "epub.min.js"), to: join(publicDir, "epubjs", "epub.min.js") },
];

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function main() {
  for (const { from, to } of FILES) {
    const name = to.slice(publicDir.length + 1);
    const sourceSize = await sizeOf(from);
    if (sourceSize === null) {
      console.warn(`[offline-viewers] ${name} not found; offline reading will do without it.`);
      continue;
    }
    // Idempotent: this runs on every install and every build, and re-copying
    // two megabytes each time is noise in the build log for no gain.
    if ((await sizeOf(to)) === sourceSize) continue;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    console.log(`[offline-viewers] copied ${name} (${Math.round(sourceSize / 1024)} KB)`);
  }
}

main().catch((error) => {
  console.warn(`[offline-viewers] skipped: ${error?.message ?? error}`);
});
