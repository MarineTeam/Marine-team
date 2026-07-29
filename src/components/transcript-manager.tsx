"use client";

import { useState } from "react";

/** Lets an admin paste or edit a video's full-text transcript. */
export function TranscriptManager({
  videoId,
  currentTranscript,
  onChange,
}: {
  videoId: string;
  currentTranscript: string | null;
  onChange: () => void;
}) {
  const [text, setText] = useState(currentTranscript ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save transcript");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transcript");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the video's transcript here…"
        rows={8}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
      >
        {saving ? "Saving…" : "Save transcript"}
      </button>
    </div>
  );
}
