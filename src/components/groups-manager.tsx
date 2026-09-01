"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AdminGroup = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  meetsWhen: string | null;
  published: boolean;
  memberCount: number;
  waiting: number;
  leaders: number;
};

export function GroupsManager() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/groups");
    if (response.ok) setGroups((await response.json()).groups);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function create(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setName("");
      await load();
    } else {
      setError((await response.json()).error ?? "Couldn't create that.");
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
        <label className="text-sm">
          <span className="block text-sec">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tuesday, north side"
            className="mt-1 rounded-md border border-sep px-3 py-1.5"
          />
        </label>
        <button type="submit" className="btn-primary rounded-md px-3 py-1.5 text-sm text-white">
          New group
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>

      {loaded && groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No groups yet.
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {groups.map((group) => (
            <li key={group.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/admin/groups/${group.id}`} className="text-sm font-medium hover:underline">
                  {group.name}
                </Link>
                <p className="text-xs text-sec">
                  {[group.meetsWhen, group.area].filter(Boolean).join(" · ") || "No details yet"}
                  {!group.published && " · draft"}
                </p>
                {group.leaders === 0 && (
                  // Nobody to answer a request is the one broken state a group
                  // can be in while looking perfectly fine on the list.
                  <p className="text-xs text-amber-700 dark:text-amber-400">No leader yet</p>
                )}
              </div>
              <p className="shrink-0 text-right text-xs text-sec">
                <span className="block">
                  {group.memberCount} {group.memberCount === 1 ? "person" : "people"}
                </span>
                {group.waiting > 0 && <span className="block text-ter">{group.waiting} waiting</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
