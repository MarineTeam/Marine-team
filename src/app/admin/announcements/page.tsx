"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  message: string;
  active: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  audience: "ALL" | "GUESTS" | "MEMBERS";
  createdAt: string;
};

const AUDIENCE_LABEL: Record<Announcement["audience"], string> = {
  ALL: "Everyone",
  GUESTS: "Guests only",
  MEMBERS: "Members only",
};

export default function AnnouncementsAdminPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Announcement["audience"]>("ALL");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/announcements");
    if (res.ok) setAnnouncements(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          active: true,
          audience,
          publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      setMessage("");
      setAudience("ALL");
      setPublishAt("");
      setExpiresAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    }
  }

  async function toggle(a: Announcement) {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    await load();
  }

  function schedule(a: Announcement) {
    return [
      a.publishAt && new Date(a.publishAt) > new Date() ? `starts ${new Date(a.publishAt).toLocaleString()}` : null,
      a.expiresAt ? `expires ${new Date(a.expiresAt).toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Announcements</h1>
        <p className="text-sm text-zinc-500">
          Shows the most recently created active announcement as a dismissible banner, scheduled by
          start/expiry time and targeted to guests, members, or everyone. Requires the Announcements plugin to
          be enabled in{" "}
          <a href="/admin/plugins" className="underline">
            Plugins
          </a>
          .
        </p>
      </div>

      <form onSubmit={create} className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Announcement message"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Announcement["audience"])}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="ALL">Everyone</option>
            <option value="GUESTS">Guests only</option>
            <option value="MEMBERS">Members only</option>
          </select>
          <label className="text-sm text-zinc-500">
            Starts
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="ml-2 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="text-sm text-zinc-500">
            Expires
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="ml-2 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Post
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {announcements.map((a) => (
          <li key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p>{a.message}</p>
              <p className="text-xs text-zinc-400">
                {AUDIENCE_LABEL[a.audience]}
                {schedule(a) && ` · ${schedule(a)}`} · posted {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => toggle(a)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${a.active ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}
              >
                {a.active ? "Active" : "Inactive"}
              </button>
              <button onClick={() => remove(a.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {announcements.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No announcements yet.</li>
        )}
      </ul>
    </div>
  );
}
