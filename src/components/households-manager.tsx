"use client";

import { useCallback, useEffect, useState } from "react";

type Member = { id: string; displayName: string; householdRole: "ADULT" | "CHILD"; active: boolean; age?: number };
type Household = {
  id: string;
  name: string;
  address?: string;
  notes?: string;
  anniversary: string | null;
  primaryContactId: string | null;
  members: Member[];
};
type Occasion = {
  householdId: string;
  personId: string | null;
  who: string;
  kind: "birthday" | "anniversary";
  inDays: number;
  turning: number | null;
};
type Loaded = { households: Household[]; occasions: Occasion[]; unhoused: { id: string; displayName: string }[] };

/**
 * The family records.
 *
 * Two things this screen shows that nothing else in the app could: who lives
 * with whom, and what is coming up for them. The second is the whole reason
 * the office keeps a birth date, so it is at the top rather than buried under
 * the list.
 */
export function HouseholdsManager() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/households");
    if (!response.ok) {
      setError("Couldn't load the households.");
      return;
    }
    setData(await response.json());
  }, []);

  useEffect(() => {
    // Fetch on mount, like every other admin manager here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "That didn't work.");
      await load();
      return true;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    // The name is optional: the server suggests one from the people picked,
    // which is what somebody who has just ticked four names actually wants.
    if (await send("/api/admin/households", "POST", { name: name.trim() || undefined, memberIds: picked })) {
      setPicked([]);
      setName("");
    }
  }

  if (!data) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      {data.occasions.length > 0 && (
        <section className="rounded-lg border border-sep p-4">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Coming up</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {data.occasions.map((occasion) => (
              <li key={`${occasion.householdId}-${occasion.personId ?? "anniversary"}`} className="flex gap-2">
                <span className="w-20 shrink-0 text-sec">
                  {occasion.inDays === 0 ? "Today" : occasion.inDays === 1 ? "Tomorrow" : `${occasion.inDays} days`}
                </span>
                <span className="text-ink">
                  {occasion.who}
                  <span className="text-sec">
                    {occasion.kind === "birthday"
                      ? occasion.turning
                        ? ` turns ${occasion.turning}`
                        : "'s birthday"
                      : occasion.turning
                        ? ` — ${occasion.turning} years`
                        : " — anniversary"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Households ({data.households.length})</h2>
        <ul className="space-y-2">
          {data.households.map((household) => (
            <li key={household.id} className="rounded-lg border border-sep">
              <button
                onClick={() => setOpen(open === household.id ? null : household.id)}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="font-medium text-ink">{household.name}</span>
                <span className="text-xs text-sec">
                  {household.members.filter((m) => m.active).length} people
                  {household.address ? " · has an address" : ""}
                </span>
              </button>

              {open === household.id && (
                <div className="space-y-3 border-t border-sep px-3 py-3 text-sm">
                  {household.address && <p className="whitespace-pre-wrap text-sec">{household.address}</p>}
                  {household.notes && <p className="text-xs whitespace-pre-wrap text-ter">{household.notes}</p>}

                  <ul className="space-y-1">
                    {household.members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between gap-2">
                        <span className={member.active ? "text-ink" : "text-ter line-through"}>
                          {member.displayName}
                          <span className="text-sec">
                            {member.householdRole === "CHILD" ? " · child" : ""}
                            {member.age === undefined ? "" : ` · ${member.age}`}
                          </span>
                          {household.primaryContactId === member.id && (
                            <span className="ml-1 text-xs text-accent">primary contact</span>
                          )}
                        </span>
                        <span className="flex gap-2 text-xs text-ter">
                          <button
                            disabled={busy}
                            onClick={() =>
                              send(`/api/admin/households/people/${member.id}`, "PATCH", {
                                householdRole: member.householdRole === "CHILD" ? "ADULT" : "CHILD",
                              })
                            }
                            className="hover:underline"
                          >
                            {member.householdRole === "CHILD" ? "Mark adult" : "Mark child"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              send(`/api/admin/households/${household.id}`, "PATCH", { primaryContactId: member.id })
                            }
                            className="hover:underline"
                          >
                            Primary
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              send(`/api/admin/households/people/${member.id}`, "PATCH", { householdId: null })
                            }
                            className="hover:underline"
                          >
                            Move out
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>

                  {data.unhoused.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-sec">
                      Add someone
                      <select
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) =>
                          e.target.value &&
                          send(`/api/admin/households/people/${e.target.value}`, "PATCH", {
                            householdId: household.id,
                          })
                        }
                        className="rounded-md border border-sep px-2 py-1"
                      >
                        <option value="">Choose…</option>
                        {data.unhoused.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete ${household.name}? The people in it stay exactly as they are.`)) {
                        void send(`/api/admin/households/${household.id}`, "DELETE");
                      }
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete this household
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-sep p-4">
        <h2 className="text-sm font-semibold text-ink">New household</h2>
        {data.unhoused.length === 0 ? (
          <p className="mt-1 text-sm text-sec">Everybody is already in one.</p>
        ) : (
          <form onSubmit={create} className="mt-2 space-y-3">
            <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {data.unhoused.map((person) => (
                <label key={person.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={picked.includes(person.id)}
                    onChange={(e) =>
                      setPicked((current) =>
                        e.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                      )
                    }
                  />
                  {person.displayName}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (left blank, one is suggested)"
                maxLength={120}
                className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={busy || picked.length === 0}
                className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                Create
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
