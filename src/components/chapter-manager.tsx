"use client";

import { useEffect, useState } from "react";
import { DragHandle, PositionInput, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";
import { formatTimestamp, parseTimestamp } from "@/lib/format";

type Chapter = { id: string; title: string; timestampSeconds: number; position: number };

/** Manages a video's chapter list: add, reorder, rename, retime, delete. */
export function ChapterManager({ videoId }: { videoId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/videos/${videoId}/chapters`);
    if (res.ok) setChapters(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is intentionally not memoized
  }, [videoId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const seconds = parseTimestamp(timestamp);
    if (!title.trim() || seconds === null) {
      setError("Enter a title and a timestamp like 1:23 or 1:02:03");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), timestampSeconds: seconds }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add chapter");
      setTitle("");
      setTimestamp("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add chapter");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/videos/chapters/${id}`, { method: "DELETE" });
    await load();
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(chapters, fromIndex, toIndex);
    setChapters(reordered);
    await Promise.all(
      reordered.map((c, i) =>
        fetch(`/api/admin/videos/chapters/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: i }),
        }),
      ),
    );
    await load();
  }

  const { draggingIndex, handleProps, dropZoneProps } = useDragReorder(reorderTo);

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter title"
          className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
          placeholder="1:23"
          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          Add chapter
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {chapters.map((c, index) => (
          <li
            key={c.id}
            className={`flex items-center gap-2 py-2 text-sm ${draggingIndex === index ? "opacity-40" : ""}`}
            {...dropZoneProps(index)}
          >
            <DragHandle {...handleProps(index)} />
            <span className="w-16 shrink-0 tabular-nums text-zinc-500">
              {formatTimestamp(c.timestampSeconds)}
            </span>
            <span className="flex-1 truncate">{c.title}</span>
            <PositionInput index={index} total={chapters.length} onReorder={(toIndex) => reorderTo(index, toIndex)} />
            <button onClick={() => remove(c.id)} className="text-red-600 hover:underline">
              Delete
            </button>
          </li>
        ))}
        {chapters.length === 0 && <li className="py-2 text-sm text-zinc-500">No chapters yet.</li>}
      </ul>
    </div>
  );
}
