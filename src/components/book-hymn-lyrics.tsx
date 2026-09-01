"use client";

import { useCallback, useMemo, useState } from "react";
import { splitVerses } from "@/lib/verses";

type Listed = {
  number: number;
  title: string;
  page: number;
  hasLyrics: boolean;
  hasCredits: boolean;
};

/** The credits, as the boxes hold them — all strings, since that is what a form has. */
type Credits = {
  ccliNumber: string;
  author: string;
  copyright: string;
  musicalKey: string;
  tempoBpm: string;
};

const NO_CREDITS: Credits = {
  ccliNumber: "",
  author: "",
  copyright: "",
  musicalKey: "",
  tempoBpm: "",
};

/**
 * Types the words of a hymn that lives inside a whole-book hymnal.
 *
 * A hymn that is its own file has a lyrics box on its row. A hymn inside a
 * scanned book has no row — it is a line in that PDF's contents — so its
 * words had nowhere to go, and a service built from book numbers offered no
 * Present button at all: the projector could show a hymn from one kind of
 * hymnal and not the other.
 *
 * Typing six hundred hymns is not the expectation. Typing the twenty a
 * congregation actually sings is, which is why this is a picker over the
 * book's indexed contents rather than a page per hymn: find the number,
 * paste the words, move on.
 */
export function BookHymnLyrics({
  file,
  onSaved,
}: {
  file: { id: string; title: string; contentsIndexedAt: string | null };
  onSaved?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [hymns, setHymns] = useState<Listed[]>([]);
  const [orphaned, setOrphaned] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Listed | null>(null);
  const [text, setText] = useState("");
  const [credits, setCredits] = useState<Credits>(NO_CREDITS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/lyrics`);
      if (!res.ok) throw new Error("Couldn't load this book's hymns");
      const data = await res.json();
      setHymns(data.hymns);
      setOrphaned(data.orphaned);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load this book's hymns");
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  async function edit(hymn: Listed) {
    setEditing(hymn);
    setText("");
    setCredits(NO_CREDITS);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/lyrics?number=${hymn.number}`);
      if (res.ok) {
        const data = await res.json();
        setText(data.lyricsText);
        setCredits({
          ccliNumber: data.ccliNumber,
          author: data.author,
          copyright: data.copyright,
          musicalKey: data.musicalKey,
          tempoBpm: String(data.tempoBpm ?? ""),
        });
      }
    } catch {
      // An empty box for a hymn that has words would overwrite them on save,
      // so a failed read closes the editor rather than offering that.
      setEditing(null);
      setError("Couldn't load those words");
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/lyrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: editing.number, lyricsText: text, ...credits }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const { hasLyrics, hasCredits } = await res.json();
      setHymns((current) =>
        current.map((hymn) =>
          hymn.number === editing.number ? { ...hymn, hasLyrics, hasCredits } : hymn,
        ),
      );
      setEditing(null);
      await onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hymns.filter((hymn) => hymn.hasLyrics || hymn.hasCredits);
    return hymns.filter(
      (hymn) => String(hymn.number) === q || hymn.title.toLowerCase().includes(q),
    );
  }, [hymns, query]);

  const withWords = hymns.filter((hymn) => hymn.hasLyrics).length;
  // Counted from what's typed rather than what's stored, so the number moves
  // while somebody is pasting and can be seen to be right.
  const verses = splitVerses(text).length;

  if (!file.contentsIndexedAt) {
    return (
      <p className="text-xs text-sec">
        Index this book&apos;s contents before typing any hymn&apos;s words — the words are stored
        against a hymn number, and this book hasn&apos;t any yet.
      </p>
    );
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
        Hymn lyrics…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-sep p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">
          Hymn lyrics {hymns.length > 0 && <span className="text-sec">— {withWords} of {hymns.length} typed</span>}
        </span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-sec hover:underline">
          Close
        </button>
      </div>

      <p className="text-xs text-sec">
        Words typed here can be put on the projector and are found by searching for a line of them;
        the credits go into the licence return and onto the screen under the words. Both stay with
        the hymn number, so re-indexing or re-scanning this book doesn&apos;t lose them. A blank
        line separates verses; a line reading &quot;Chorus&quot; marks one.
      </p>

      {editing ? (
        <div className="space-y-2">
          <div className="text-xs font-medium">
            {editing.number}. {editing.title}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="w-full rounded-md border border-sep px-2 py-1.5 font-mono text-xs"
            placeholder={"Amazing grace, how sweet the sound\nThat saved a wretch like me\n\nChorus\n..."}
          />
          {/* The credits, under the words: a licence return needs the CCLI
              number, and a projector is required to carry the copyright line
              while the words are up. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="space-y-1 text-xs">
              <span className="text-sec">CCLI number</span>
              <input
                value={credits.ccliNumber}
                onChange={(e) => setCredits({ ...credits, ccliNumber: e.target.value })}
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Key</span>
              <input
                value={credits.musicalKey}
                onChange={(e) => setCredits({ ...credits, musicalKey: e.target.value })}
                placeholder="G"
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Tempo (bpm)</span>
              <input
                type="number"
                value={credits.tempoBpm}
                onChange={(e) => setCredits({ ...credits, tempoBpm: e.target.value })}
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Words &amp; music</span>
              <input
                value={credits.author}
                onChange={(e) => setCredits({ ...credits, author: e.target.value })}
                placeholder="John Newton"
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs">
            <span className="text-sec">
              Copyright line — shown on the projector under the words, as a licence requires
            </span>
            <input
              value={credits.copyright}
              onChange={(e) => setCredits({ ...credits, copyright: e.target.value })}
              placeholder="© 1779 Public Domain"
              className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-sec hover:underline">
              Cancel
            </button>
            <span className="text-sec">
              {verses === 0 ? "No words — the hymn can't be projected" : `${verses} verses`}
            </span>
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a hymn by number or title…"
            className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
          />
          {loading ? (
            <p className="text-xs text-sec">Loading…</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {matches.slice(0, 40).map((hymn) => (
                <li key={hymn.number}>
                  <button
                    type="button"
                    onClick={() => void edit(hymn)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-hover"
                  >
                    <span className="w-10 shrink-0 tabular-nums text-sec">{hymn.number}</span>
                    <span className="flex-1 truncate">{hymn.title}</span>
                    {hymn.hasLyrics && <span className="shrink-0 text-green-600">words</span>}
                    {hymn.hasCredits && <span className="shrink-0 text-sec">CCLI</span>}
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="text-sec">
                  {query.trim()
                    ? `Nothing matching “${query.trim()}” in this book's contents.`
                    : "No words typed yet — search for a hymn to start one."}
                </li>
              )}
              {matches.length > 40 && <li className="text-sec">…and {matches.length - 40} more</li>}
            </ul>
          )}
        </>
      )}

      {orphaned.length > 0 && (
        <p className="text-xs text-amber-600">
          Words are stored for {orphaned.length} number{orphaned.length === 1 ? "" : "s"} this
          book&apos;s contents no longer list ({orphaned.slice(0, 8).join(", ")}
          {orphaned.length > 8 ? "…" : ""}). They&apos;re kept, and will attach again if those
          numbers come back.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
