"use client";

import { useState } from "react";
import type { ShareLinkRow } from "@/components/share-link-list";

export type ShareLinkFormTarget = { seriesId?: string; videoId?: string };

const EXPIRY_OPTIONS = [
  { value: "", label: "Never expires" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/**
 * Creates a share link. Used both on a series/video page (where `target` is
 * fixed to the thing being looked at) and in the admin panel (where the
 * caller supplies a picker and passes the chosen target down), so the request
 * shape and validation messages stay in one place.
 */
export function ShareLinkForm({
  target,
  endpoint,
  onCreated,
  disabled = false,
}: {
  target: ShareLinkFormTarget | null;
  /** "/api/share-links" for members, "/api/admin/share-links" for the admin panel. */
  endpoint: string;
  onCreated: (link: ShareLinkRow) => void;
  disabled?: boolean;
}) {
  const [visibility, setVisibility] = useState<"PUBLIC" | "EMAIL">("PUBLIC");
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) {
      setError("Pick something to share first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          visibility,
          emails: visibility === "EMAIL" ? emails : undefined,
          note: note.trim() || null,
          expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create link");
      onCreated(await res.json());
      setEmails("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === "PUBLIC"}
            onChange={() => setVisibility("PUBLIC")}
          />
          Anyone with the link
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === "EMAIL"}
            onChange={() => setVisibility("EMAIL")}
          />
          Only specific people
        </label>
      </div>

      {visibility === "EMAIL" && (
        <div>
          <label htmlFor="share-emails" className="block font-medium">
            Recipient emails
          </label>
          <textarea
            id="share-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            placeholder="someone@example.com, another@example.com"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">
            We email each person their link. They&apos;ll need to log in with that address to open it, so forwarding it
            on won&apos;t hand over access.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="share-note" className="block font-medium">
            Note <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="share-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="What this link was for"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="share-expiry" className="block font-medium">
            Expires
          </label>
          <select
            id="share-expiry"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || disabled}
        className="rounded-md bg-zinc-900 text-white px-4 py-1.5 hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {saving ? "Creating…" : "Create link"}
      </button>
    </form>
  );
}
