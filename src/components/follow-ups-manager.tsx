"use client";

import { useCallback, useEffect, useState } from "react";

type FollowUp = {
  id: string;
  title: string;
  note: string | null;
  status: "OPEN" | "DONE" | "DISMISSED";
  source: string;
  dueOn: string;
  outcome: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; email: string; displayName: string | null; name: string | null } | null;
  person: { id: string; displayName: string } | null;
};
type Counts = { open: number; overdue: number; unassigned: number; done: number; dismissed: number };

/** The queue, worked from the top. */
export function FollowUpsManager({ meId }: { meId: string }) {
  const [rows, setRows] = useState<FollowUp[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/follow-ups${closed ? "?closed=1" : ""}`);
    if (!response.ok) return setError("Couldn't load the queue.");
    const body = await response.json();
    setRows(body.followUps);
    setCounts(body.counts);
  }, [closed]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(id: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/follow-ups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "That didn't work.");
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!rows || !counts) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      <p className="flex flex-wrap gap-3 text-sm text-sec">
        <span className="text-ink">{counts.open} open</span>
        {counts.overdue > 0 && <span className="text-red-600">{counts.overdue} overdue</span>}
        {counts.unassigned > 0 && <span>{counts.unassigned} nobody has picked up</span>}
        <button onClick={() => setClosed(!closed)} className="text-accent hover:underline">
          {closed ? "Hide closed" : "Show closed"}
        </button>
      </p>

      <ul className="space-y-2">
        {rows.map((row) => {
          const late = row.status === "OPEN" && row.dueOn < today;
          return (
            <li key={row.id} className="space-y-2 rounded-lg border border-sep px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className={row.status === "OPEN" ? "text-ink" : "text-ter line-through"}>{row.title}</span>
                <span className={`shrink-0 text-xs ${late ? "text-red-600" : "text-ter"}`}>
                  {late ? "overdue · " : ""}
                  {row.dueOn}
                </span>
              </div>
              {row.note && <p className="text-xs text-sec">{row.note}</p>}
              {row.outcome && <p className="text-xs text-ter">→ {row.outcome}</p>}

              {row.status === "OPEN" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {row.assignedToId === null ? (
                    <button
                      disabled={busy}
                      onClick={() => act(row.id, { action: "assign", assignedToId: meId })}
                      className="rounded-md border border-sep px-2 py-1 text-ink"
                    >
                      I&apos;ll do it
                    </button>
                  ) : (
                    <span className="text-sec">
                      {row.assignedTo?.displayName ?? row.assignedTo?.name ?? row.assignedTo?.email}
                      <button
                        disabled={busy}
                        onClick={() => act(row.id, { action: "assign", assignedToId: null })}
                        className="ml-2 text-ter hover:underline"
                      >
                        put back
                      </button>
                    </span>
                  )}
                  <input
                    value={outcome[row.id] ?? ""}
                    onChange={(e) => setOutcome({ ...outcome, [row.id]: e.target.value })}
                    placeholder="What came of it"
                    className="flex-1 rounded-md border border-sep px-2 py-1"
                  />
                  <button
                    disabled={busy}
                    onClick={() => act(row.id, { action: "close", status: "DONE", outcome: outcome[row.id] })}
                    className="rounded-md border border-sep px-2 py-1 text-ink"
                  >
                    Done
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act(row.id, { action: "close", status: "DISMISSED", outcome: outcome[row.id] })}
                    className="text-ter hover:underline"
                  >
                    Not needed
                  </button>
                </div>
              )}
              {row.status !== "OPEN" && (
                <button disabled={busy} onClick={() => act(row.id, { action: "reopen" })} className="text-xs text-accent hover:underline">
                  Reopen
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          await fetch("/api/admin/follow-ups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          setTitle("");
          setBusy(false);
          await load();
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Something that needs doing"
          maxLength={200}
          className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy || !title.trim()} className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60">
          Add
        </button>
      </form>
    </div>
  );
}
