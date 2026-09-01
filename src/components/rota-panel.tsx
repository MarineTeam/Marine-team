"use client";

import { useState } from "react";

type Assignment = {
  id: string;
  role: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  note: string | null;
  planId: string;
  planTitle: string;
  /** The day it is for, already written out — the server knows the locale rules. */
  day: string | null;
  published: boolean;
};

type Blockout = { id: string; startDate: string; endDate: string; reason: string | null };

/**
 * What a member has been asked to do, and when they are away.
 *
 * Answering is the point: a rota that only *tells* people they are on is a
 * list, and the person building it still has to chase everyone by text. So
 * Yes and No are the two biggest things on this page, and a No can carry a
 * reason without needing a separate conversation.
 */
export function RotaPanel({
  assignments: initial,
  blockouts: initialBlockouts,
}: {
  assignments: Assignment[];
  blockouts: Blockout[];
}) {
  const [assignments, setAssignments] = useState(initial);
  const [blockouts, setBlockouts] = useState(initialBlockouts);
  const [busy, setBusy] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");

  async function answer(id: string, status: "ACCEPTED" | "DECLINED", note?: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", assignmentId: id, status, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't send that");
      setAssignments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status, note: note?.trim() || null } : item,
        ),
      );
      setDecliningId(null);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that");
    } finally {
      setBusy(null);
    }
  }

  async function addBlockout() {
    if (!from || !to) return;
    setBusy("blockout");
    setError(null);
    try {
      const res = await fetch("/api/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "blockout", startDate: from, endDate: to, reason: why }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that");
      setBlockouts((current) => [...current, data.blockout]);
      setFrom("");
      setTo("");
      setWhy("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  async function removeBlockout(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/rota?id=${id}`, { method: "DELETE" });
      setBlockouts((current) => current.filter((item) => item.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">You&apos;re on for</h2>
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
            Nothing on the rota for you at the moment.
          </p>
        ) : (
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {assignments.map((item) => (
              <li key={item.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{item.role}</span>
                  <span className="text-xs text-sec">{item.day ?? "Date to be confirmed"}</span>
                </div>
                <p className="text-xs text-sec">
                  {item.planTitle}
                  {/* A plan that isn't published yet is still a real ask — it
                      just isn't on the members' list, and saying so beats a
                      link that goes nowhere. */}
                  {!item.published && " · not published yet"}
                </p>

                {item.status === "INVITED" ? (
                  decliningId === item.id ? (
                    <div className="space-y-2">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Anything they should know? (optional)"
                        className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                      />
                      <div className="flex flex-wrap gap-2 text-sm">
                        <button
                          onClick={() => void answer(item.id, "DECLINED", reason)}
                          disabled={busy === item.id}
                          className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button
                          onClick={() => setDecliningId(null)}
                          className="text-sec hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 text-sm">
                      <button
                        onClick={() => void answer(item.id, "ACCEPTED")}
                        disabled={busy === item.id}
                        className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
                      >
                        Yes, I can
                      </button>
                      <button
                        onClick={() => setDecliningId(item.id)}
                        className="rounded-md border border-sep px-3 py-1.5"
                      >
                        Can&apos;t make it
                      </button>
                    </div>
                  )
                ) : (
                  <p className="text-xs">
                    <span
                      className={item.status === "ACCEPTED" ? "text-green-600" : "text-amber-600"}
                    >
                      {item.status === "ACCEPTED" ? "You said yes" : "You said you can't"}
                    </span>
                    {item.note && <span className="text-sec"> — {item.note}</span>}{" "}
                    <button
                      onClick={() =>
                        void answer(item.id, item.status === "ACCEPTED" ? "DECLINED" : "ACCEPTED")
                      }
                      className="text-sec hover:underline"
                    >
                      change
                    </button>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">When you&apos;re away</h2>
        <p className="text-sm text-sec">
          Dates you can&apos;t serve. Whoever builds the rota is warned before they ask you — it
          doesn&apos;t stop them asking, since sometimes a rota is a conversation.
        </p>

        {blockouts.length > 0 && (
          <ul className="divide-y divide-sep rounded-lg border border-sep text-sm">
            {blockouts.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {item.startDate.slice(0, 10)} → {item.endDate.slice(0, 10)}
                  {item.reason && <span className="text-sec"> · {item.reason}</span>}
                </span>
                <button
                  onClick={() => void removeBlockout(item.id)}
                  disabled={busy === item.id}
                  className="text-xs text-sec hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-sec">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-sec">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5"
            />
          </label>
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block text-xs text-sec">Reason (optional)</span>
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Away"
              className="w-full rounded-md border border-sep px-2 py-1.5"
            />
          </label>
          <button
            onClick={() => void addBlockout()}
            disabled={!from || !to || busy === "blockout"}
            className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
