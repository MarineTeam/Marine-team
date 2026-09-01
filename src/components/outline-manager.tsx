"use client";

import { useMemo, useState } from "react";
import { parseOutline } from "@/lib/outline";

/**
 * Writes the fill-in-the-blank note sheet for a talk.
 *
 * Plain text with three or more underscores for each gap, rather than a
 * builder with an "add blank" button: this is how these get written
 * everywhere else — in a document, the night before — and pasting one in
 * should just work.
 */
export function OutlineManager({
  videoId,
  currentOutline,
  onChange,
}: {
  videoId: string;
  currentOutline: string | null;
  onChange: () => void;
}) {
  const [text, setText] = useState(currentOutline ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blanks = useMemo(() => parseOutline(text).blanks, [text]);
  const changingGaps = Boolean(currentOutline) && parseOutline(currentOutline ?? "").blanks !== blanks;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteOutline: text.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save the note sheet");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the note sheet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-sep p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Grace is ____ and ____.\n\nThree marks of a disciple:\n1. ____\n2. ____\n3. ____"}
        rows={8}
        className="w-full rounded-md border border-sep px-3 py-2 font-mono text-sm"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save note sheet"}
        </button>
        <span className="text-sec">
          {blanks} gap{blanks === 1 ? "" : "s"} · three or more underscores makes one
        </span>
        {error && <span className="text-red-600">{error}</span>}
      </div>

      {/* A gap is identified by its position, so adding or removing one moves
          every answer after it. Nothing can fix that after the fact — the
          people who have already filled it in are told, not silently
          re-shuffled — but it is worth knowing before pressing Save. */}
      {changingGaps && (
        <p className="text-xs text-amber-600">
          This changes how many gaps the sheet has. Anyone who has already filled it in will be
          told their answers may no longer line up.
        </p>
      )}
    </div>
  );
}
