"use client";

import { useState } from "react";
import { formatTimestamp, parseTimestamp } from "@/lib/format";

type Note = { id: string; timestampSeconds: number; body: string };

/**
 * A member's private notes on a video, each stamped with a timestamp.
 * `startPositionSeconds` only prefills the timestamp field once, as a
 * starting point to adjust from — it isn't kept in sync with real playback.
 * Bunny's embed does support reading live position via Player.js (see
 * video-player.tsx), just not wired up here yet.
 */
export function SermonNotesPanel({
  videoId,
  videoTitle,
  initialNotes,
  startPositionSeconds,
}: {
  videoId: string;
  videoTitle: string;
  initialNotes: Note[];
  startPositionSeconds: number;
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [body, setBody] = useState("");
  const [timestamp, setTimestamp] = useState(formatTimestamp(startPositionSeconds));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const seconds = parseTimestamp(timestamp);
    if (!body.trim() || seconds === null) {
      setError("Enter a note and a timestamp like 1:23");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, timestampSeconds: seconds, body: body.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save note");
      const note = await res.json();
      setNotes((prev) => [...prev, note].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    }
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody.trim() }),
    });
    if (res.ok) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, body: editBody.trim() } : n)));
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function exportNotes() {
    const text = notes
      .map((n) => `[${formatTimestamp(n.timestampSeconds)}] ${n.body}`)
      .join("\n\n");
    const blob = new Blob([`${videoTitle}\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">My notes</h2>
        {notes.length > 0 && (
          <button onClick={exportNotes} className="text-xs text-sec hover:underline">
            Export as text
          </button>
        )}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
          className="w-20 shrink-0 rounded-md border border-sep px-2 py-1.5 text-sm tabular-nums"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          className="min-w-[10rem] flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md btn-primary text-white px-3 py-1.5 text-sm"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-sep text-sm">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-2">
            <span className="w-14 shrink-0 tabular-nums text-sec">{formatTimestamp(n.timestampSeconds)}</span>
            {editingId === n.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  autoFocus
                  className="min-w-[10rem] flex-1 rounded-md border border-sep px-2 py-1"
                />
                <button onClick={() => saveEdit(n.id)} className="text-sec hover:underline">
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="text-sec hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <p className="flex-1 whitespace-pre-wrap text-sec">{n.body}</p>
                <button
                  onClick={() => {
                    setEditingId(n.id);
                    setEditBody(n.body);
                  }}
                  className="text-sec hover:underline"
                >
                  Edit
                </button>
                <button onClick={() => remove(n.id)} className="text-red-600 hover:underline">
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
        {notes.length === 0 && <li className="py-2 text-sec">No notes yet — jot one down as you watch.</li>}
      </ul>
    </section>
  );
}
