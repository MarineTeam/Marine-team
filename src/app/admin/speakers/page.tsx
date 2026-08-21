"use client";

import { useEffect, useState } from "react";
import { DragHandle, useDragReorder } from "@/components/reorder-controls";
import { reorderArray } from "@/lib/reorder";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  bulkFetch,
  runBulk,
  useBulkSelect,
} from "@/components/bulk-select";

type Speaker = { id: string; name: string; slug: string; bio: string | null; photoUrl: string | null; position: number };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function SpeakersAdminPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bulk = useBulkSelect(speakers.map((s) => s.id));

  async function bulkDelete() {
    if (!confirm(`Delete ${bulk.count} speaker${bulk.count === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    await runBulk(bulk.selected, (id) => bulkFetch(`/api/admin/speakers/${id}`, { method: "DELETE" }));
    bulk.clear();
    setBusy(false);
    await load();
  }

  async function load() {
    const res = await fetch("/api/admin/speakers");
    if (res.ok) setSpeakers(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slugify(name),
          bio: bio.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add speaker");
      setName("");
      setBio("");
      setPhotoUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add speaker");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this speaker? Videos keep playing, just without a speaker attached.")) return;
    await fetch(`/api/admin/speakers/${id}`, { method: "DELETE" });
    await load();
  }

  async function reorderTo(fromIndex: number, toIndex: number) {
    const reordered = reorderArray(speakers, fromIndex, toIndex);
    await Promise.all(
      reordered.map((s, i) =>
        fetch(`/api/admin/speakers/${s.id}`, {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Speakers</h1>
        <p className="text-sm text-zinc-500">
          Preachers/presenters, browsable at <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/speakers/[slug]</code>.
          Attach one to a video from its row in{" "}
          <a href="/admin/videos" className="underline">
            Videos
          </a>
          .
        </p>
      </div>

      <form onSubmit={create} className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Speaker name"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Short bio (optional)"
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Photo URL (optional)"
            className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Add
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {speakers.length > 0 && (
        <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={busy} />
      )}

      <BulkBar count={bulk.count} onClear={bulk.clear} busy={busy}>
        <BulkButton danger onClick={bulkDelete}>
          Delete
        </BulkButton>
      </BulkBar>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {speakers.map((s, index) => (
          <li
            key={s.id}
            className={`p-4 flex items-center gap-3 ${draggingIndex === index ? "opacity-40" : ""}`}
            {...dropZoneProps(index)}
          >
            <BulkCheckbox
              checked={bulk.isSelected(s.id)}
              onToggle={(shift) => bulk.toggle(s.id, shift)}
              label={s.name}
            />
            <DragHandle {...handleProps(index)} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name}</p>
              {s.bio && <p className="truncate text-sm text-zinc-500">{s.bio}</p>}
            </div>
            <button onClick={() => remove(s.id)} className="text-red-600 hover:underline text-sm">
              Delete
            </button>
          </li>
        ))}
        {speakers.length === 0 && <li className="p-4 text-sm text-zinc-500">No speakers yet.</li>}
      </ul>
    </div>
  );
}
