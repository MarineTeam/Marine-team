"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";

type Change =
  | "BAPTISM"
  | "PROFESSION"
  | "TRANSFER_IN"
  | "RESTORED"
  | "DEATH"
  | "TRANSFER_OUT"
  | "REQUEST"
  | "LAPSED";

const LABELS: Record<Change, string> = {
  BAPTISM: "baptism",
  PROFESSION: "profession of faith",
  TRANSFER_IN: "transfer in",
  RESTORED: "restored to the roll",
  DEATH: "death",
  TRANSFER_OUT: "transfer out",
  REQUEST: "at their own request",
  LAPSED: "lapsed at a revision",
};

const JOININGS: Change[] = ["BAPTISM", "PROFESSION", "TRANSFER_IN", "RESTORED"];
const LEAVINGS: Change[] = ["DEATH", "TRANSFER_OUT", "REQUEST", "LAPSED"];

type Entry = {
  personId: string;
  name: string;
  householdName: string | null;
  since: string;
  joined: Change;
};

type Revision = {
  from: string;
  to: string;
  openingCount: number;
  joined: { personId: string; change: Change; on: string }[];
  left: { personId: string; change: Change; on: string }[];
  closingCount: number;
  net: number;
  reconciles: boolean;
  joinedByRoute: Record<Change, number>;
  leftByRoute: Record<Change, number>;
};

/**
 * The membership roll.
 *
 * The date box is the point of this screen, not a filter on it: the question a
 * return asks is who was on the roll on 31 December, and a list that only ever
 * shows today cannot answer it. Changing the date changes what the roll *was*,
 * which is why the heading says so rather than leaving it to be inferred.
 */
export function MembershipRoll() {
  const [roll, setRoll] = useState<Entry[] | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; displayName: string }[]>([]);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [at, setAt] = useState("");
  const [span, setSpan] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    personId: "",
    change: "TRANSFER_IN" as Change,
    on: "",
    congregation: "",
    note: "",
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (at) params.set("at", at);
    if (span.from && span.to) {
      params.set("from", span.from);
      params.set("to", span.to);
    }
    const response = await fetch(`/api/admin/membership?${params}`);
    if (!response.ok) return setError("Couldn't load the roll.");
    const body = await response.json();
    setRoll(body.roll);
    setCandidates(body.candidates);
    setRevision(body.revision);
    setAt((current) => current || body.at);
  }, [at, span]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That didn't work.");
      await load();
      return true;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!roll) return <LoadState error={error} />;

  const leaving = LEAVINGS.includes(form.change);

  return (
    <div className="space-y-6">
      {error && <Problem>{error}</Problem>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-sec">
          The roll as it stood on
          <input
            type="date"
            value={at}
            onChange={(event) => setAt(event.target.value)}
            className="mt-1 block rounded-md border border-sep px-3 py-1.5 text-sm"
          />
        </label>
        <p className="text-sm text-ink">
          <span className="text-xl">{roll.length}</span> on the roll
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">On the roll</h2>
        <ul aria-label="The roll" className="space-y-1 text-xs">
          {roll.map((entry) => (
            <li
              key={entry.personId}
              className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1"
            >
              <span className="text-ink">{entry.name}</span>
              {entry.householdName && <span className="text-ter">{entry.householdName}</span>}
              <span className="text-sec">since {entry.since}</span>
              <span className="text-ter">{LABELS[entry.joined]}</span>
            </li>
          ))}
        </ul>
        {roll.length === 0 && <p className="text-sm text-sec">Nobody was on the roll that day.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Record a change</h2>
        <p className="text-xs text-ter">
          Dated the day it took effect, not today — a revision held in March records lapses dated
          to the previous 31 December. Nothing here is ever edited or deleted: a correction is a
          further entry, which is what keeps last year&apos;s roll reproducible.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send({
              personId: form.personId,
              change: form.change,
              on: form.on,
              congregation: form.congregation || undefined,
              note: form.note || undefined,
            });
            if (ok) setForm({ ...form, personId: "", congregation: "", note: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="text-xs text-sec">
            Who
            <select
              required
              value={form.personId}
              onChange={(event) => setForm({ ...form, personId: event.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {/* Those already on the roll are offered too: somebody has to be
                  on it to come off it, and the server refuses the pairs that
                  do not make sense. */}
              {roll.map((entry) => (
                <option key={entry.personId} value={entry.personId}>
                  {entry.name} (on the roll)
                </option>
              ))}
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-sec">
            What happened
            <select
              value={form.change}
              onChange={(event) => setForm({ ...form, change: event.target.value as Change })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <optgroup label="Onto the roll">
                {JOININGS.map((change) => (
                  <option key={change} value={change}>
                    {LABELS[change]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Off the roll">
                {LEAVINGS.map((change) => (
                  <option key={change} value={change}>
                    {LABELS[change]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="text-xs text-sec">
            When it took effect
            <input
              type="date"
              required
              value={form.on}
              onChange={(event) => setForm({ ...form, on: event.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <input
            value={form.congregation}
            onChange={(event) => setForm({ ...form, congregation: event.target.value })}
            placeholder={leaving ? "Where they went (optional)" : "Where they came from (optional)"}
            maxLength={200}
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Anything else — read one person at a time, never in a list"
            maxLength={1000}
            className="rounded-md border border-sep px-3 py-1.5 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-2"
          >
            Record it
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">A revision</h2>
        <p className="text-xs text-ter">
          So many at the start, so many in by each route, so many out by each, so many at the end —
          the shape of an annual return.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-sec">
            From
            <input
              type="date"
              value={span.from}
              onChange={(event) => setSpan({ ...span, from: event.target.value })}
              className="mt-1 block rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-sec">
            To
            <input
              type="date"
              value={span.to}
              onChange={(event) => setSpan({ ...span, to: event.target.value })}
              className="mt-1 block rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
        </div>

        {revision && (
          <div className="space-y-1 text-xs">
            {!revision.reconciles && (
              <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600" role="alert">
                These figures do not add up: the opening roll plus those who joined less those who
                left does not equal the closing roll. Something is wrong with the report rather
                than with the church.
              </p>
            )}
            <p className="text-sec">
              <span className="text-ink">{revision.openingCount}</span> at the start,{" "}
              <span className="text-ink">{revision.joined.length}</span> in,{" "}
              <span className="text-ink">{revision.left.length}</span> out,{" "}
              <span className="text-ink">{revision.closingCount}</span> at the end (
              {revision.net >= 0 ? `+${revision.net}` : revision.net})
            </p>
            <dl className="flex flex-wrap gap-x-4 text-ter">
              {JOININGS.filter((change) => revision.joinedByRoute[change] > 0).map((change) => (
                <span key={change}>
                  <dt className="inline">{LABELS[change]}:</dt>{" "}
                  <dd className="inline text-sec">{revision.joinedByRoute[change]}</dd>
                </span>
              ))}
              {LEAVINGS.filter((change) => revision.leftByRoute[change] > 0).map((change) => (
                <span key={change}>
                  <dt className="inline">{LABELS[change]}:</dt>{" "}
                  <dd className="inline text-sec">{revision.leftByRoute[change]}</dd>
                </span>
              ))}
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
