"use client";

import { useCallback, useEffect, useState } from "react";

type Caption = { srclang: string; label: string | null };

/**
 * Lets an admin upload a .vtt/.srt caption track per video. Bunny stores
 * the file itself and shows a CC toggle in its own embed player once one
 * exists — nothing here renders captions, it only manages what Bunny has.
 */
export function CaptionsManager({ videoId }: { videoId: string }) {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [srclang, setSrclang] = useState("en");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/videos/${videoId}/captions`);
    if (res.ok) setCaptions((await res.json()).captions);
  }, [videoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !srclang.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("srclang", srclang.trim());
      form.append("label", label.trim());
      const res = await fetch(`/api/admin/videos/${videoId}/captions`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add caption");
      setCaptions((await res.json()).captions);
      setFile(null);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add caption");
    } finally {
      setSaving(false);
    }
  }

  async function remove(lang: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/videos/${videoId}/captions?srclang=${encodeURIComponent(lang)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to remove caption");
      setCaptions((await res.json()).captions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove caption");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-sep p-3">
      {captions && captions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {captions.map((c) => (
            <li key={c.srclang} className="flex items-center justify-between gap-2">
              <span>
                {c.label ?? c.srclang} <span className="text-sec">({c.srclang})</span>
              </span>
              <button
                onClick={() => remove(c.srclang)}
                disabled={saving}
                className="text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {captions && captions.length === 0 && (
        <p className="text-xs text-sec">No captions yet.</p>
      )}

      <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
        <input
          value={srclang}
          onChange={(e) => setSrclang(e.target.value)}
          placeholder="en"
          maxLength={5}
          className="w-16 rounded-md border border-sep px-2 py-1 text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="English"
          className="flex-1 min-w-[8rem] rounded-md border border-sep px-2 py-1 text-sm"
        />
        <input
          type="file"
          accept=".vtt,.srt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm max-w-full"
        />
        <button
          type="submit"
          disabled={saving || !file || !srclang.trim()}
          className="rounded-md border border-sep px-2 py-1 text-sm disabled:opacity-50"
        >
          Upload
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
