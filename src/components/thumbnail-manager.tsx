"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Lets an admin override a video's Bunny Stream thumbnail — from a pasted
 * URL, or an uploaded image file — instead of relying on the frame Bunny
 * auto-picked during encoding.
 */
export function ThumbnailManager({
  videoId,
  currentUrl,
  onChange,
}: {
  videoId: string;
  currentUrl: string;
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailUrl: url.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to set thumbnail");
      setUrl("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set thumbnail");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/videos/${videoId}/thumbnail`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      setFile(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-sep p-3">
      <div className="flex items-center gap-3">
        {currentUrl && (
          <Image
            src={currentUrl}
            alt=""
            width={96}
            height={56}
            unoptimized
            className="h-14 w-24 rounded object-cover bg-chip"
          />
        )}
        <p className="text-xs text-sec">
          Bunny Stream generates this automatically from the video. Set a custom one below to
          override it.
        </p>
      </div>

      <form onSubmit={setFromUrl} className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1 min-w-[12rem] rounded-md border border-sep px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={saving || !url.trim()}
          className="rounded-md border border-sep px-2 py-1 text-sm disabled:opacity-50"
        >
          Set from URL
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm max-w-full"
        />
        <button
          onClick={uploadFile}
          disabled={saving || !file}
          className="rounded-md border border-sep px-2 py-1 text-sm disabled:opacity-50"
        >
          Upload image
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
