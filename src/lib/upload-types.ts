/**
 * What a file upload may be, and how each kind is served back.
 *
 * The browser's `file.type` is a claim, not a fact — it is whatever the
 * uploading page put there, and a crafted request can put anything. The first
 * version of the upload route stored that claim and the content route served
 * it back verbatim, inline. So somebody trusted to edit one series could
 * upload `handout.html` with a type of `text/html` and have it run as this
 * origin in the browser of any admin who opened the link.
 *
 * Two rules close that, and both are here so the upload routes and the
 * content route cannot disagree:
 *
 *   1. **A file is what its extension says, from a short list.** The type
 *      stored, and the type served, both come from `UPLOAD_TYPES` — never from
 *      the request.
 *   2. **Only a reader's formats and media are shown inline.** Everything
 *      else is a download, whatever it is, and anything not on the list at
 *      all is a download of `application/octet-stream` with `nosniff`, which
 *      is the combination browsers refuse to interpret.
 *
 * SVG is deliberately not an image here: opened directly, an SVG is a
 * document and its scripts run.
 */

export type UploadKind = "pdf" | "epub" | "audio" | "image" | "document";

export type UploadType = {
  ext: string;
  mime: string;
  kind: UploadKind;
  /** Whether a browser may open it in place rather than download it. */
  inline: boolean;
};

const inline = (ext: string, mime: string, kind: UploadKind): UploadType => ({ ext, mime, kind, inline: true });
const download = (ext: string, mime: string, kind: UploadKind): UploadType => ({ ext, mime, kind, inline: false });

/** Keyed by extension, lower-case, no dot. */
export const UPLOAD_TYPES: Readonly<Record<string, UploadType>> = Object.freeze({
  pdf: inline("pdf", "application/pdf", "pdf"),
  epub: inline("epub", "application/epub+zip", "epub"),

  mp3: inline("mp3", "audio/mpeg", "audio"),
  m4a: inline("m4a", "audio/mp4", "audio"),
  aac: inline("aac", "audio/aac", "audio"),
  ogg: inline("ogg", "audio/ogg", "audio"),
  wav: inline("wav", "audio/wav", "audio"),

  jpg: inline("jpg", "image/jpeg", "image"),
  jpeg: inline("jpeg", "image/jpeg", "image"),
  png: inline("png", "image/png", "image"),
  webp: inline("webp", "image/webp", "image"),
  gif: inline("gif", "image/gif", "image"),

  docx: download("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"),
  pptx: download("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"),
  xlsx: download("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"),
  odt: download("odt", "application/vnd.oasis.opendocument.text", "document"),
  odp: download("odp", "application/vnd.oasis.opendocument.presentation", "document"),
  ods: download("ods", "application/vnd.oasis.opendocument.spreadsheet", "document"),
  txt: download("txt", "text/plain", "document"),
  csv: download("csv", "text/csv", "document"),
});

/** The extension of a name or path: lower-case, without the dot, ignoring any query or fragment. */
export function extensionOf(nameOrPath: string): string {
  const clean = nameOrPath.split("?")[0].split("#")[0];
  const last = clean.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return "";
  return last.slice(dot + 1).toLowerCase();
}

/** The allowed type for a name, or null when it isn't one. */
export function uploadType(nameOrPath: string): UploadType | null {
  return UPLOAD_TYPES[extensionOf(nameOrPath)] ?? null;
}

/**
 * Where a new upload is stored.
 *
 * The id makes the object unique; the client's basename used to be appended
 * to it and added nothing but a way to put `..`, `/` and `?` into a storage
 * path. Now only the extension survives, and only if it is on the list.
 */
export function objectName(id: string, originalName: string): string | null {
  const type = uploadType(originalName);
  if (!type) return null;
  return `files/${id}.${type.ext}`;
}

export type ServePolicy = {
  contentType: string;
  /** Whether `inline` is permitted; a download is forced otherwise. */
  inline: boolean;
  /** Extra headers that make a document harmless if a browser opens it anyway. */
  headers: Readonly<Record<string, string>>;
};

/**
 * The entry whose MIME type is exactly this string, if there is one.
 *
 * The fallback for a stored object whose *path* says nothing — an import from
 * the storage dashboard named `books/hymnal`, or an upload from before the
 * extension rule existed. It is safe to consult the stored type here in a way
 * it is not safe to serve it, because the only types it can resolve to are the
 * ones on the list, and the list contains nothing a browser executes: a stored
 * `text/html` matches no entry and falls through to the opaque download.
 *
 * Without this, such a file was typed by the reader page (which reads the
 * stored MIME) as a book and served by the content route as an attachment —
 * so the reader opened on bytes the browser had already downloaded.
 */
function byMime(mimeType: string | null | undefined): UploadType | null {
  const mime = mimeType?.toLowerCase().trim();
  if (!mime) return null;
  return Object.values(UPLOAD_TYPES).find((type) => type.mime === mime) ?? null;
}

/**
 * How to serve a stored object.
 *
 * The path's extension decides, because that is what was checked on the way
 * in. A stored MIME type is consulted only when the path has no extension on
 * the list at all, and then only for an exact match against the list itself —
 * never as a string to echo into a header, which is what made an uploaded
 * `text/html` run as this origin.
 */
export function servePolicy(path: string, storedMimeType?: string | null): ServePolicy {
  const type = uploadType(path) ?? byMime(storedMimeType);
  const nosniff = { "X-Content-Type-Options": "nosniff" } as const;
  if (!type) {
    return {
      contentType: "application/octet-stream",
      inline: false,
      // `sandbox` with no allowances: even a browser that ignored the type and
      // the disposition would render this with scripts off and no origin.
      headers: { ...nosniff, "Content-Security-Policy": "sandbox" },
    };
  }
  return {
    contentType: type.mime,
    inline: type.inline,
    headers: type.inline ? nosniff : { ...nosniff, "Content-Security-Policy": "sandbox" },
  };
}

/** The sentence an upload form shows when a file is refused. */
export function refusedUploadMessage(): string {
  const exts = Object.keys(UPLOAD_TYPES).map((ext) => `.${ext}`);
  return `That kind of file can't be uploaded here. Allowed: ${exts.join(", ")}.`;
}
