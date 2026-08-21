/**
 * Turning an uploaded file's name into a sensible default title.
 *
 * Only the extension is removed. It's tempting to also swap underscores and
 * hyphens for spaces or fix capitalisation, but those are guesses about what
 * someone meant to call the file, and a wrong guess is more annoying to
 * correct than the raw name — which they can see and edit before uploading.
 */
export function titleFromFilename(filename: string): string {
  // A browser's File.name is already a bare name, but a drag from some
  // clients (and Windows paths generally) can carry directory parts.
  const base = filename.split(/[\\/]/).pop() ?? "";

  const lastDot = base.lastIndexOf(".");
  // lastDot > 0 rather than !== -1: a leading dot is part of the name for
  // files like ".gitignore", not an extension separator, and stripping it
  // would leave an empty title.
  const withoutExtension = lastDot > 0 ? base.slice(0, lastDot) : base;

  return withoutExtension.trim();
}
