"use client";

import { useCallback, useEffect, useState } from "react";

export type ReadingMark = {
  id: string;
  kind: "HIGHLIGHT" | "BOOKMARK" | "NOTE";
  location: string;
  excerpt: string | null;
  note: string | null;
  color: string;
};

export const MARK_COLOR_CLASS: Record<string, string> = {
  yellow: "bg-yellow-200 dark:bg-yellow-900/60",
  green: "bg-green-200 dark:bg-green-900/60",
  blue: "bg-sky-200 dark:bg-sky-900/60",
  pink: "bg-pink-200 dark:bg-pink-900/60",
};

const KIND_ICON: Record<ReadingMark["kind"], string> = {
  HIGHLIGHT: "🖍",
  BOOKMARK: "🔖",
  NOTE: "📝",
};

/**
 * The marks sidebar: everything this member has highlighted, bookmarked or
 * annotated in the current book, newest work at the bottom, each clickable
 * to jump back to where it was made.
 *
 * Marks are listed from their stored excerpt rather than by re-resolving
 * each location in the book — a location can stop resolving if the file is
 * replaced with a re-paginated edition, and a highlight whose text still
 * reads correctly is far more useful then than a row that silently vanishes.
 */
export function ReaderMarks({
  fileId,
  marks,
  onChanged,
  onGoTo,
  canMark,
}: {
  fileId: string;
  marks: ReadingMark[];
  onChanged: (marks: ReadingMark[]) => void;
  onGoTo: (location: string) => void;
  canMark: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/reading/marks?fileId=${encodeURIComponent(fileId)}`);
    if (!res.ok) return;
    const data = await res.json();
    onChanged(data.marks ?? []);
  }, [fileId, onChanged]);

  useEffect(() => {
    if (canMark) void refresh();
  }, [canMark, refresh]);

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/reading/marks/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/reading/marks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draftNote }),
      });
      setEditingId(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!canMark) {
    return <p className="text-sm text-zinc-500">Log in to highlight and bookmark as you read.</p>;
  }

  if (marks.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing marked yet. Select text to highlight it, or use Bookmark to save your place.
      </p>
    );
  }

  return (
    <ul className="space-y-2 text-sm">
      {marks.map((mark) => (
        <li key={mark.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-start gap-2">
            <span aria-hidden>{KIND_ICON[mark.kind]}</span>
            <button
              onClick={() => onGoTo(mark.location)}
              className="min-w-0 flex-1 text-left hover:underline"
            >
              {mark.excerpt ? (
                <span className={`${MARK_COLOR_CLASS[mark.color] ?? MARK_COLOR_CLASS.yellow} rounded px-1`}>
                  {mark.excerpt}
                </span>
              ) : (
                <span className="text-zinc-500">Saved place</span>
              )}
            </button>
            <button
              onClick={() => remove(mark.id)}
              disabled={busyId === mark.id}
              aria-label="Delete mark"
              className="shrink-0 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {editingId === mark.id ? (
            <div className="mt-2 space-y-1">
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={3}
                aria-label="Note"
                className="w-full rounded border border-zinc-300 p-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveNote(mark.id)}
                  disabled={busyId === mark.id}
                  className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              {mark.note && <p className="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-400">{mark.note}</p>}
              <button
                onClick={() => {
                  setEditingId(mark.id);
                  setDraftNote(mark.note ?? "");
                }}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                {mark.note ? "Edit note" : "Add note"}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
