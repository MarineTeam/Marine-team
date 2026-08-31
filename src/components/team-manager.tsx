"use client";

import { useCallback, useEffect, useState } from "react";

type Person = { id: string; name: string | null; displayName: string | null; email: string };
type Member = { id: string; userId: string; position: string | null; user: Person };
type Team = { id: string; name: string; members: Member[] };

function label(person: Person): string {
  return person.displayName?.trim() || person.name?.trim() || person.email;
}

/**
 * The teams that serve, and who is on them.
 *
 * A team is a list to pick from when building a rota — the point of a rota is
 * not typing names every week — and the job somebody usually does is kept
 * beside them so it comes up as the default.
 */
export function TeamManager() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState("");
  const [adding, setAdding] = useState<Record<string, { userId: string; position: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/teams");
      if (!res.ok) throw new Error("Couldn't load the teams");
      const data = await res.json();
      setTeams(data.teams);
      setPeople(data.people);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the teams");
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

  if (loading) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-sec">New team</span>
          <input
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            placeholder="Musicians"
            className="rounded-md border border-sep px-2 py-1.5"
          />
        </label>
        <button
          onClick={async () => {
            if (!newTeam.trim()) return;
            if (await send("/api/admin/teams", "POST", { name: newTeam })) setNewTeam("");
          }}
          className="rounded-md border border-sep px-3 py-1.5"
        >
          Add team
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {teams.length === 0 && (
        <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
          No teams yet. A team is a group you schedule from — musicians, welcome, sound, readers.
        </p>
      )}

      {teams.map((team) => {
        const draft = adding[team.id] ?? { userId: "", position: "" };
        const notOnTeam = people.filter(
          (person) => !team.members.some((member) => member.userId === person.id),
        );
        return (
          <section key={team.id} className="space-y-3 rounded-lg border border-sep p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{team.name}</h3>
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete the ${team.name} team?`)) return;
                  await send(`/api/admin/teams/${team.id}`, "DELETE");
                }}
                className="text-xs text-sec hover:underline"
              >
                Delete team
              </button>
            </div>

            {team.members.length > 0 && (
              <ul className="divide-y divide-sep rounded-md border border-sep text-sm">
                {team.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate">{label(member.user)}</span>
                      {member.position && (
                        <span className="block text-xs text-sec">{member.position}</span>
                      )}
                    </span>
                    <button
                      onClick={() =>
                        void send(`/api/admin/teams/${team.id}`, "PATCH", {
                          removeUserId: member.userId,
                        })
                      }
                      className="shrink-0 text-xs text-sec hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="space-y-1">
                <span className="block text-xs text-sec">Add someone</span>
                <select
                  value={draft.userId}
                  onChange={(e) => setAdding({ ...adding, [team.id]: { ...draft, userId: e.target.value } })}
                  className="rounded-md border border-sep px-2 py-1.5"
                >
                  <option value="">Choose…</option>
                  {notOnTeam.map((person) => (
                    <option key={person.id} value={person.id}>
                      {label(person)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-sec">Usually does</span>
                <input
                  value={draft.position}
                  onChange={(e) =>
                    setAdding({ ...adding, [team.id]: { ...draft, position: e.target.value } })
                  }
                  placeholder="Piano"
                  className="rounded-md border border-sep px-2 py-1.5"
                />
              </label>
              <button
                onClick={async () => {
                  if (!draft.userId) return;
                  if (
                    await send(`/api/admin/teams/${team.id}`, "PATCH", {
                      addUserId: draft.userId,
                      position: draft.position,
                    })
                  ) {
                    setAdding({ ...adding, [team.id]: { userId: "", position: "" } });
                  }
                }}
                disabled={!draft.userId}
                className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
