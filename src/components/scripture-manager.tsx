"use client";

import { useState } from "react";

/** Lets an admin edit a video's scripture references (e.g. "John 3:16-18"), comma-separated. */
export function ScriptureManager({
  videoId,
  currentRefs,
  onChange,
}: {
  videoId: string;
  currentRefs: string[];
  onChange: () => void;
}) {
  const [text, setText] = useState(currentRefs.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const scriptureRefs = text
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptureRefs }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save scripture references");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scripture references");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-sep p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="John 3:16-18, Romans 8:28"
        className="w-full rounded-md border border-sep px-3 py-2 text-sm"
      />
      <p className="text-xs text-sec">Comma-separated references, e.g. &ldquo;John 3:16-18, Romans 8:28&rdquo;.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md border border-sep px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save references"}
      </button>
    </div>
  );
}
