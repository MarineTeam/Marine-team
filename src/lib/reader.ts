/**
 * Pure helpers shared by the PDF and EPUB readers. Kept free of any DOM,
 * pdf.js or epub.js import so they can be unit-tested directly and imported
 * from a server component without dragging a ~2MB renderer along.
 */

export type ReaderFormat = "pdf" | "epub";

/**
 * Which reader (if any) can open a file.
 *
 * The stored `mimeType` is whatever the browser reported at upload time and
 * is regularly wrong or missing for EPUB — plenty of systems send
 * `application/octet-stream` — so the file extension is checked as a
 * fallback rather than trusted second.
 */
export function readerFormat(mimeType: string | null | undefined, path: string): ReaderFormat | null {
  const mime = mimeType?.toLowerCase().trim() ?? "";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/epub+zip" || mime === "application/epub") return "epub";

  const extension = path.toLowerCase().split("?")[0].split("#")[0].split(".").pop() ?? "";
  if (extension === "pdf") return "pdf";
  if (extension === "epub") return "epub";
  return null;
}

/**
 * Percentages are stored as a whole number 0-100; anything outside that is a
 * bug upstream, not a value to persist.
 *
 * Only NaN is special-cased. An infinity clamps to the nearer bound on its
 * own through Math.min/max, and treating it as 0 (as a blanket
 * `Number.isFinite` guard would) turns "past the end" into "back to the
 * start" — which, written to ReadingProgress, would throw away someone's
 * place in a book.
 */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Splits extracted page/chapter text into speakable chunks.
 *
 * Chunking rather than handing the whole page to speechSynthesis in one
 * utterance is what makes read-aloud controllable: it gives a place to stop
 * between sentences, a unit to highlight as it's read, and it dodges the
 * long-utterance truncation several engines have. Sentences longer than
 * `maxLength` are split on a nearby space instead, so one runaway sentence
 * can't produce a 5,000-character utterance.
 */
export function toSpeechChunks(text: string, maxLength = 240): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  // Split *after* terminal punctuation, keeping it attached, so the speech
  // engine still hears the sentence ending and intones it.
  const sentences = normalized.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [normalized];

  const chunks: string[] = [];
  for (const raw of sentences) {
    let sentence = raw.trim();
    if (!sentence) continue;
    while (sentence.length > maxLength) {
      const cut = sentence.lastIndexOf(" ", maxLength);
      const at = cut > 0 ? cut : maxLength;
      chunks.push(sentence.slice(0, at).trim());
      sentence = sentence.slice(at).trim();
    }
    if (sentence) chunks.push(sentence);
  }
  return chunks;
}

/**
 * Case-insensitive match positions of `query` in `text`.
 *
 * Used by both readers' in-book search. Returns character offsets so the
 * caller can map them back to its own coordinate system — a pdf.js text
 * item, or a CFI range — without this helper needing to know which.
 */
export function findMatches(text: string, query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const haystack = text.toLowerCase();

  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    positions.push(at);
    // Advance by one rather than by needle length, so overlapping matches
    // ("aa" in "aaa") are all found rather than every other one.
    from = at + 1;
  }
  return positions;
}

/**
 * The `filename` part of a Content-Disposition header for a download.
 *
 * A file's title is admin-entered free text going straight into an HTTP
 * header, so it is stripped of CR/LF (header injection) and quotes (which
 * would end the quoted string early) rather than interpolated as-is. The
 * extension is taken from the stored path, not the title, so a download
 * still opens in the right application when someone names a file "Psalms"
 * with no extension.
 *
 * Both forms are emitted: a plain ASCII `filename` every client
 * understands, and RFC 5987 `filename*` carrying the real UTF-8 title, so
 * non-ASCII names survive on clients that support it.
 */
export function contentDispositionFilename(title: string, path: string): string {
  const extension = path.toLowerCase().split("?")[0].split("#")[0].split(".").pop() ?? "";
  const suffix = extension && extension.length <= 8 && /^[a-z0-9]+$/.test(extension) ? `.${extension}` : "";

  const cleaned = title.replace(/[\r\n"\\]/g, " ").trim() || "download";
  const withExtension = cleaned.toLowerCase().endsWith(suffix.toLowerCase()) ? cleaned : `${cleaned}${suffix}`;

  // The ASCII fallback drops anything outside printable ASCII rather than
  // transliterating it; filename* below carries the accurate version.
  const ascii = withExtension.replace(/[^\x20-\x7E]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(withExtension)}`;
}

/** A short bit of context around a search hit, for the results list. */
export function excerptAround(text: string, at: number, length: number, radius = 60): string {
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
