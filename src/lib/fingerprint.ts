/**
 * A short token for "this list, as it reads right now".
 *
 * A device holding something offline — a book's hymns, a service's running
 * order — needs a way to ask whether what it has is still what the server
 * says, without downloading the whole thing to find out. This is that
 * answer: computed the same way over the same lines on both sides, and
 * compared.
 *
 * FNV-1a rather than a real digest: this is a change detector, not a
 * security boundary, and it has to run synchronously wherever it's needed.
 */
export function fingerprintLines(lines: string[]): string {
  let hash = 0x811c9dc5;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      // The FNV prime, by shifts: a plain multiply overflows into a float and
      // stops being the same function.
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
  }
  // The count travels with it so two lists can't collide into looking
  // identical on a hash alone.
  return `${lines.length}-${hash.toString(16)}`;
}
