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
  coverWanted: boolean;
  coverNote: string | null;
  /** Whether this one is still open to hand on: published, and not yet past. */
  coverable: boolean;
};

/** Somebody else's slot, on a team this member is on, that needs taking. */
type CoverRequest = {
  id: string;
  role: string;
  planTitle: string;
  day: string | null;
  askedBy: string;
  note: string | null;
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
  coverRequests: initialCover = [],
}: {
  assignments: Assignment[];
  blockouts: Blockout[];
  coverRequests?: CoverRequest[];
}) {
  const [assignments, setAssignments] = useState(initial);
  const [blockouts, setBlockouts] = useState(initialBlockouts);
  const [coverRequests, setCoverRequests] = useState(initialCover);
  const [askingId, setAskingId] = useState<string | null>(null);
  const [askNote, setAskNote] = useState("");
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

  /** Puts a slot up for somebody else, or takes it back down. */
  async function cover(id: string, wanted: boolean, note?: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "cover", assignmentId: id, wanted, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't send that");
      setAssignments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, coverWanted: wanted, coverNote: wanted ? note?.trim() || null : null } : item,
        ),
      );
      setAskingId(null);
      setAskNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Takes somebody else's slot.
   *
   * A 409 of `confirm_away` is not a failure: it means this member told the
   * rota they were away that day. They are asked once and, if they say yes,
   * the same request goes again with the confirmation — rather than the page
   * arguing with the person offering to help.
   */
  async function take(request: CoverRequest, confirmAway = false) {
    setBusy(request.id);
    setError(null);
    try {
      const res = await fetch("/api/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "take", assignmentId: request.id, confirmAway }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "confirm_away" && !confirmAway) {
          setBusy(null);
          if (confirm(data.error)) return take(request, true);
          return;
        }
        throw new Error(data.error ?? "Couldn't take that");
      }
      setCoverRequests((current) => current.filter((item) => item.id !== request.id));
      setAssignments((current) => [
        ...current,
        {
          id: request.id,
          role: request.role,
          status: "ACCEPTED",
          note: null,
          planId: "",
          planTitle: request.planTitle,
          day: request.day,
          published: true,
          coverWanted: false,
          coverNote: null,
          coverable: true,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't take that");
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

                {item.coverWanted && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Asking your team to cover this
                    {item.coverNote && <span className="text-sec"> — {item.coverNote}</span>}{" "}
                    <button onClick={() => void cover(item.id, false)} className="text-sec hover:underline">
                      never mind
                    </button>
                  </p>
                )}

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

                {item.coverable && !item.coverWanted && item.status !== "DECLINED" && (
                  askingId === item.id ? (
                    <div className="space-y-2">
                      <input
                        value={askNote}
                        onChange={(e) => setAskNote(e.target.value)}
                        placeholder="Anything the team should know? (optional)"
                        className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                      />
                      <div className="flex flex-wrap gap-2 text-sm">
                        <button
                          onClick={() => void cover(item.id, true, askNote)}
                          disabled={busy === item.id}
                          className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
                        >
                          Ask the team
                        </button>
                        <button onClick={() => setAskingId(null)} className="text-sec hover:underline">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAskingId(item.id);
                        setAskNote("");
                      }}
                      className="text-xs text-sec hover:underline"
                    >
                      Ask someone to cover this
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {coverRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Cover needed</h2>
          <p className="text-sm text-sec">
            Somebody on one of your teams can&apos;t make these. Taking one puts you on in their place.
          </p>
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {coverRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{request.role}</p>
                  <p className="text-xs text-sec">
                    {request.planTitle} · {request.day ?? "Date to be confirmed"} · asked by {request.askedBy}
                  </p>
                  {request.note && <p className="text-xs text-ter">{request.note}</p>}
                </div>
                <button
                  onClick={() => void take(request)}
                  disabled={busy === request.id}
                  className="shrink-0 rounded-md btn-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {busy === request.id ? "Taking…" : "I'll take it"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
