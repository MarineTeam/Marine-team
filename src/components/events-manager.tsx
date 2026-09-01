"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AdminEvent = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  published: boolean;
  registration: boolean;
  capacity: number | null;
  taken: number;
  going: number;
  waiting: number;
};

/** The diary: everything upcoming and everything past, newest first. */
export function EventsManager() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/events");
    if (response.ok) setEvents((await response.json()).events);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function create(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, startsAt: new Date(startsAt).toISOString() }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't create that.");
      setTitle("");
      setStartsAt("");
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
        <label className="text-sm">
          <span className="block text-sec">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Men's Breakfast"
            className="mt-1 rounded-md border border-sep px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-sec">Starts</span>
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 rounded-md border border-sep px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add event"}
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>

      {loaded && events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          Nothing in the diary yet.
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/admin/events/${event.id}`} className="text-sm font-medium hover:underline">
                  {event.title}
                </Link>
                <p className="text-xs text-sec">
                  {new Date(event.startsAt).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {!event.published && " · draft"}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-sec">
                {event.registration ? (
                  <>
                    <span className="block">
                      {event.taken}
                      {event.capacity !== null && ` / ${event.capacity}`} places
                    </span>
                    {event.waiting > 0 && <span className="block text-ter">{event.waiting} waiting</span>}
                  </>
                ) : (
                  <span className="text-ter">no sign-up</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
