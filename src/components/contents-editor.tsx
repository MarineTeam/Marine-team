"use client";

import { useCallback, useMemo, useState } from "react";
import { formatContentsText, parseContentsText } from "@/lib/book-contents";
import { hymnNumberOf } from "@/lib/toc-nav";

/**
 * Types a book's contents out by hand, for the books whose PDFs can't say.
 *
 * The indexing pass reads a PDF's bookmarks, and a book that has none — the
 * common case for a cheap scan — indexes to nothing, which leaves its whole
 * hymnal section without a search box. The contents are printed in the front
 * of the book; this is where somebody copies them in, once.
 *
 * It also opens an already-indexed book, so a bookmark that reads
 * "214 Amazing Grac" can be corrected without re-scanning anything. What
 * comes back writes exactly as it was stored, nesting included, so saving
 * after changing one line changes one line.
 */
export function ContentsEditor({
  file,
  onSaved,
}: {
  file: { id: string; title: string; pageOffset: number; contentsIndexedAt: string | null };
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** What was loaded, to tell "emptied on purpose" from "not loaded yet". */
  const [storedCount, setStoredCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/contents`);
      if (!res.ok) throw new Error("Couldn't load this book's contents");
      const data = await res.json();
      setStoredCount(data.entries.length);
      // Formatted against the offset the *server* holds, not the one being
      // typed into the box beside this: an unsaved offset hasn't been applied
      // to anything stored, and using it here would misread every page.
      setText(formatContentsText(data.entries, data.pageOffset));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load this book's contents");
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  // Re-parsed as it is typed, which is the whole point of the preview: a
  // typo in a page number is invisible until something counts it.
  const parsed = useMemo(() => parseContentsText(text, file.pageOffset), [text, file.pageOffset]);
  const numbered = useMemo(
    () => parsed.entries.filter((entry) => hymnNumberOf(entry.title) !== null).length,
    [parsed.entries],
  );

  async function save() {
    // Saving an empty box is how a wrong index gets cleared, so it stays
    // possible — but it is also what an accidental select-all looks like,
    // and the entries are gone either way.
    if (parsed.entries.length === 0 && storedCount > 0) {
      const sure = window.confirm(
        `Remove all ${storedCount} indexed entries from “${file.title}”? Its hymns stop being findable.`,
      );
      if (!sure) return;
    }

    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/contents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: parsed.entries }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setStoredCount(parsed.entries.length);
      setSaved(`Saved ${parsed.entries.length} entries`);
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
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
        {file.contentsIndexedAt ? "Edit contents…" : "Type contents…"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-sep p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Contents</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-sec hover:underline">
          Close
        </button>
      </div>

      <p className="text-xs text-sec">
        One hymn per line: its label, then the page it starts on —{" "}
        <code className="rounded bg-chip px-1">214 Amazing Grace | 230</code>. A tab or a pipe
        separates them, and so does the last number on the line, so a column pasted from a
        spreadsheet works as it is. Indent two spaces to put a hymn under a section heading.
        {file.pageOffset !== 0 && (
          <>
            {" "}
            Pages are the ones <strong>printed in the book</strong>; this book&apos;s offset of{" "}
            {file.pageOffset} is applied for you. Write <code className="rounded bg-chip px-1">pdf:2</code>{" "}
            for something in the front matter, which has no printed number.
          </>
        )}
      </p>

      {loading ? (
        <p className="text-xs text-sec">Loading…</p>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder={"Advent | 4\n  214 Amazing Grace | 230\n  302 It Is Well With My Soul | 318"}
          className="w-full rounded-md border border-sep px-2 py-1.5 font-mono text-xs"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${parsed.entries.length} entries`}
        </button>
        <span className="text-sec">
          {numbered} numbered
          {parsed.problems.length > 0 && ` · ${parsed.problems.length} unreadable`}
        </span>
        {saved && <span className="text-green-600">{saved}</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      {/* Named line by line rather than counted: the point is to be able to
          go and fix them, and a list of twenty says the same as a list of
          five about what kind of mistake it is. */}
      {parsed.problems.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600">
          {parsed.problems.slice(0, 5).map((problem) => (
            <li key={problem.line}>
              Line {problem.line}: {problem.reason} — “{problem.raw}”
            </li>
          ))}
          {parsed.problems.length > 5 && <li>…and {parsed.problems.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}
