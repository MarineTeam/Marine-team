"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { possibleDuplicates } from "@/lib/schedules/duplicates";

type AdminPerson = {
  id: string;
  displayName: string;
  normalizedName: string;
  active: boolean;
  eventCount?: number;
  aliases?: string[];
};

/**
 * The names on the rotas, and merging the ones that are the same person.
 *
 * Spreadsheets produce near-duplicates — "Cindy" on one sheet, "Cynthia" on
 * another — and once both exist a person's history is split in two. Merging
 * moves it onto one record and keeps the other spelling as an alias, so the
 * next sync of the sheet that produced the duplicate resolves to the right
 * person instead of creating it again.
 */
export function PeopleManager() {
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/people");
      if (!res.ok) throw new Error("Couldn't load the people");
      setPeople((await res.json()).people);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the people");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "That didn't work");
      return false;
    }
    await load();
    return true;
  }

  const suggestions = useMemo(() => possibleDuplicates(people), [people]);

  if (loading) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Offered, never done automatically: which two names belong to one
          person is not a guess an app should act on. */}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-900">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            These look like they might be the same person
          </p>
          <ul className="mt-1 space-y-1 text-xs text-sec">
            {suggestions.map(([a, b]) => (
              <li key={`${a.id}-${b.id}`}>
                {a.displayName} / {b.displayName}{" "}
                <button
                  onClick={() => {
                    setFrom(b.id);
                    setInto(a.id);
                  }}
                  className="text-accent hover:underline"
                >
                  merge these
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-sec">Add a person</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md border border-sep px-2 py-1.5"
          />
        </label>
        <button
          onClick={async () => {
            if (!name.trim()) return;
            if (await send("/api/admin/people", "POST", { displayName: name.trim() })) setName("");
          }}
          className="rounded-md border border-sep px-3 py-1.5"
        >
          Add
        </button>
        <span className="text-xs text-sec">
          People are also created by a sync, or by typing a name onto an event.
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-sep rounded-lg border border-sep text-sm">
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block truncate">{person.displayName}</span>
              {person.aliases && person.aliases.length > 0 && (
                <span className="block text-xs text-sec">also {person.aliases.join(", ")}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-3 text-xs text-sec">
              {person.eventCount !== undefined && <span>{person.eventCount} events</span>}
              <button
                onClick={async () => {
                  if (!window.confirm(`Remove ${person.displayName}?`)) return;
                  await send(`/api/admin/people/${person.id}`, "DELETE");
                }}
                disabled={busy === person.id}
                className="hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
        {people.length === 0 && <li className="p-3 text-sec">Nobody yet.</li>}
      </ul>

      <div className="space-y-2 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-medium">Merge two people</h2>
        <p className="text-xs text-sec">
          The first one&apos;s events move to the second, and their spelling is kept as an alias so
          the next sync resolves to the right person.
        </p>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1 text-xs">
            <span className="block text-sec">Merge</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="block text-sec">into</span>
            <select
              value={into}
              onChange={(e) => setInto(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {people
                .filter((person) => person.id !== from)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
            </select>
          </label>
          <button
            onClick={async () => {
              if (!from || !into) return;
              setBusy("merge");
              if (await send("/api/admin/people/merge", "POST", { sourcePersonId: from, targetPersonId: into })) {
                setFrom("");
                setInto("");
              }
              setBusy(null);
            }}
            disabled={!from || !into || busy === "merge"}
            className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
          >
            {busy === "merge" ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
