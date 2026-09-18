"use client";

import { useCallback, useEffect, useState } from "react";

type Member = { id: string; displayName: string; householdRole: "ADULT" | "CHILD"; active: boolean };
type Family = {
  id: string;
  name: string;
  code: string;
  members: Member[];
  records: Record<string, { id: string; checkedOutAt: string | null } | null>;
};
type Entry = {
  id: string;
  childId: string;
  name: string;
  age: number | null;
  code: string;
  medicalNotes: string | null;
  checkedOutAt: string | null;
  releasedTo: string | null;
  overrideReason: string | null;
};
type Register = { session: { id: string; name: string; room: string | null; closedAt: string | null }; here: number; children: Entry[] };

/**
 * The desk.
 *
 * One screen, because that is what it is in the room: a person with a queue in
 * front of them types a surname, presses a name, and hands over a label. The
 * register underneath is the list that has to be empty before anybody goes
 * home, so it is always visible rather than behind a tab.
 *
 * Everything this shows came from the server having applied the rules. The
 * component never decides who may collect anybody — it shows what it was told
 * and reports what was refused.
 */
export function CheckinDesk({ sessionId }: { sessionId: string }) {
  const [register, setRegister] = useState<Register | null>(null);
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<Family[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState<{ child: Entry; family: Family } | null>(null);
  const [code, setCode] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [override, setOverride] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/checkin/${sessionId}`);
    if (response.ok) setRegister(await response.json());
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/checkin/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "That didn't work.");
      return payload;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const found = await post({ action: "search", query });
    if (found) setFamilies(found.families);
  }

  async function checkIn(family: Family, child: Member, broughtById: string | null) {
    const done = await post({ action: "check-in", childId: child.id, broughtById });
    if (!done) return;
    setMessage(
      `${child.displayName} is in. Code ${done.labels.pickup.code}${done.note ? ` — ${done.note}` : ""}`,
    );
    await load();
    const again = await post({ action: "search", query });
    if (again) setFamilies(again.families);
    void family;
  }

  async function doRelease(useOverride: boolean) {
    if (!collecting) return;
    const done = await post({
      action: "release",
      childId: collecting.child.childId,
      ...(useOverride
        ? { overrideReason: override }
        : { code, collectorId: collectorId || null }),
    });
    if (!done) return;
    setMessage(
      done.by === "override"
        ? `${collecting.child.name} released on an override. It has been recorded.`
        : `${collecting.child.name} collected.`,
    );
    setCollecting(null);
    setCode("");
    setCollectorId("");
    setOverride("");
    await load();
  }

  if (!register) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      {message && <p className="rounded-md border border-sep bg-hover px-3 py-2 text-sm text-ink">{message}</p>}
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      {!register.session.closedAt && (
        <section className="space-y-3">
          <form onSubmit={search} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Surname, or a child's name"
              className="flex-1 rounded-md border border-sep px-3 py-2 text-base"
              autoFocus
            />
            <button type="submit" disabled={busy} className="btn-primary rounded-md px-4 py-2 text-sm text-white">
              Find
            </button>
          </form>

          {families.map((family) => (
            <div key={family.id} className="rounded-lg border border-sep p-3">
              <p className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{family.name}</span>
                <span className="font-mono text-lg tracking-widest text-accent">{family.code}</span>
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {family.members
                  .filter((member) => member.householdRole === "CHILD" && member.active)
                  .map((child) => {
                    const record = family.records[child.id];
                    const inRoom = record && !record.checkedOutAt;
                    return (
                      <li key={child.id} className="flex items-center justify-between gap-2">
                        <span className="text-ink">{child.displayName}</span>
                        {inRoom ? (
                          <span className="text-xs text-sec">already in</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <select
                              defaultValue=""
                              onChange={(e) => void checkIn(family, child, e.target.value || null)}
                              disabled={busy}
                              className="rounded-md border border-sep px-2 py-1 text-xs"
                            >
                              <option value="">Check in — brought by…</option>
                              {family.members
                                .filter((m) => m.householdRole === "ADULT" && m.active)
                                .map((adult) => (
                                  <option key={adult.id} value={adult.id}>
                                    {adult.displayName}
                                  </option>
                                ))}
                            </select>
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">
          In the room: {register.here}
          {register.session.room ? ` · ${register.session.room}` : ""}
        </h2>
        <ul className="space-y-1">
          {register.children.map((entry) => (
            <li
              key={entry.id}
              className={`flex items-start justify-between gap-2 rounded-md border border-sep px-3 py-2 text-sm ${
                entry.checkedOutAt ? "opacity-50" : ""
              }`}
            >
              <span>
                <span className="text-ink">{entry.name}</span>
                {entry.age !== null && <span className="text-sec"> · {entry.age}</span>}
                <span className="ml-2 font-mono text-xs tracking-widest text-ter">{entry.code}</span>
                {/* The one place a medical note appears: a screen in the room,
                    where somebody can act on it. Never on a label. */}
                {entry.medicalNotes && (
                  <span className="mt-0.5 block text-xs font-medium text-red-600">{entry.medicalNotes}</span>
                )}
                {entry.checkedOutAt && (
                  <span className="mt-0.5 block text-xs text-ter">
                    collected{entry.releasedTo ? ` by ${entry.releasedTo}` : ""}
                    {entry.overrideReason ? ` — override: ${entry.overrideReason}` : ""}
                  </span>
                )}
              </span>
              {!entry.checkedOutAt && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    const found = await post({ action: "search", query: entry.name.split(" ")[0] });
                    const family = found?.families?.find((f: Family) => f.records[entry.childId]);
                    if (family) setCollecting({ child: entry, family });
                    else setError("Couldn't find that child's household.");
                  }}
                  className="shrink-0 rounded-md border border-sep px-2 py-1 text-xs text-ink"
                >
                  Collect
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {collecting && (
        <section className="space-y-3 rounded-lg border border-accent p-4">
          <h2 className="text-sm font-semibold text-ink">Collecting {collecting.child.name}</h2>
          <label className="block text-sm">
            <span className="text-sec">Code on their ticket</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded-md border border-sep px-3 py-2 font-mono text-lg tracking-widest"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="text-sec">Who is collecting</span>
            <select
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              className="mt-1 w-full rounded-md border border-sep px-3 py-2"
            >
              <option value="">Choose…</option>
              {collecting.family.members
                .filter((m) => m.householdRole === "ADULT" && m.active)
                .map((adult) => (
                  <option key={adult.id} value={adult.id}>
                    {adult.displayName}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => void doRelease(false)}
              className="btn-primary rounded-md px-4 py-2 text-sm text-white"
            >
              Release
            </button>
            <button onClick={() => setCollecting(null)} className="rounded-md border border-sep px-3 py-2 text-sm">
              Cancel
            </button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-ter">Neither of those is right</summary>
            <p className="mt-2 text-xs text-sec">
              A leader can hand the child over anyway. Say why — it goes in the record and the audit
              log with your name on it.
            </p>
            <textarea
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              rows={2}
              placeholder="Aunt collecting; mum rang the office"
              className="mt-2 w-full rounded-md border border-sep px-3 py-2 text-sm"
            />
            <button
              disabled={busy || override.trim().length === 0}
              onClick={() => void doRelease(true)}
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
            >
              Override and release
            </button>
          </details>
        </section>
      )}
    </div>
  );
}
