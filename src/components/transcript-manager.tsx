"use client";

import { useState } from "react";

/**
 * Lets an admin paste or edit a video's full-text transcript — or ask for one
 * to be written automatically.
 *
 * The automatic route queues rather than transcribes: an hour of audio takes
 * minutes, so the work happens on a schedule (see /api/cron/transcribe) and
 * this reports where it has got to.
 */
export function TranscriptManager({
  videoId,
  currentTranscript,
  transcriptStatus,
  transcriptError,
  onChange,
}: {
  videoId: string;
  currentTranscript: string | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  onChange: () => void;
}) {
  const [text, setText] = useState(currentTranscript ?? "");
  const [saving, setSaving] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transcribe() {
    setQueueing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/transcribe`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't queue this one");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't queue this one");
    } finally {
      setQueueing(false);
    }
  }

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
    <div className="space-y-2 rounded-lg border border-sep p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the video's transcript here…"
        rows={8}
        className="w-full rounded-md border border-sep px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save transcript"}
        </button>
        <button
          onClick={transcribe}
          disabled={queueing || transcriptStatus === "RUNNING"}
          className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
        >
          {queueing ? "Queueing…" : currentTranscript ? "Transcribe again" : "Transcribe it for me"}
        </button>
        {/* Where it has got to. QUEUED and RUNNING both mean "come back
            later" — the work happens on a schedule, not while this page is
            open — so neither pretends to be a progress bar. */}
        <span className="text-xs text-sec">
          {transcriptStatus === "QUEUED" && "Queued — it runs on the hour."}
          {transcriptStatus === "RUNNING" && "Being transcribed now."}
          {transcriptStatus === "DONE" && "Transcribed automatically."}
          {transcriptStatus === "FAILED" && (
            <span className="text-red-600">{transcriptError ?? "Transcription failed."}</span>
          )}
        </span>
      </div>
    </div>
  );
}
