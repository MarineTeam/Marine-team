"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";

type Method = "PAPER" | "ONLINE" | "VERBAL";

type Blocked = {
  reason: string;
  label: string;
  fixable: boolean;
  gifts: number;
  amount: number;
  worth: number;
};
type ScheduleRow = { firstName: string; lastName: string; postcode: string; amount: string };
type Declaration = {
  id: string;
  personId: string;
  madeOn: string;
  coversPast: boolean;
  withdrawnOn: string | null;
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
  how: Method;
};
type Claim = {
  id: string;
  from: string;
  to: string;
  donationTotal: number;
  claimTotal: number;
  giftCount: number;
  submittedOn: string | null;
  settledOn: string | null;
  reference: string | null;
};
type Payload = {
  view: {
    from: string;
    to: string;
    summary: { giftCount: number; donationTotal: number; claimTotal: number };
    blocked: Blocked[];
    expiring: { giftId: string; givenAt: string; amount: number; deadline: string }[];
    schedule: ScheduleRow[];
    awaitingLetter: number;
  };
  declarations: Declaration[];
  claims: Claim[];
  worth: { claimableNow: number; fixable: number; lost: number };
};

const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );

/**
 * Gift Aid.
 *
 * The screen leads with what is claimable and what is being left behind,
 * because those are the two numbers that make somebody act. The blocked list is
 * given as much room as the claim: "no declaration on file — £4,120 unclaimed"
 * is a sentence that gets four letters written, and "12 gifts blocked" is not.
 */
export function GiftAidManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [span, setSpan] = useState({ from: "", to: "" });

  const [form, setForm] = useState({
    personId: "",
    madeOn: "",
    coversPast: true,
    firstName: "",
    lastName: "",
    houseNumber: "",
    postcode: "",
    how: "PAPER" as Method,
  });

  const query = span.from && span.to ? `?from=${span.from}&to=${span.to}` : "";

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/giving/gift-aid${query}`);
    if (!response.ok) return setError("Couldn't load the Gift Aid figures.");
    setData(await response.json());
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(body: unknown, method: "POST" | "DELETE" = "POST", suffix = "") {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`/api/admin/giving/gift-aid${suffix}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "That didn't work.");
      await load();
      return payload;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <LoadState error={error} />;

  const { view, worth } = data;

  return (
    <div className="space-y-6">
      {error && <Problem>{error}</Problem>}
      {note && <p className="rounded-md border border-sep px-3 py-2 text-sm text-ink">{note}</p>}

      <section className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-sep px-3 py-2">
          <p className="text-xs text-sec">Claimable now</p>
          <p className="mt-0.5 text-xl text-ink">{money(worth.claimableNow)}</p>
          <p className="mt-0.5 text-xs text-ter">tax to reclaim, all spans</p>
        </div>
        <div className="rounded-lg border border-amber-300 px-3 py-2">
          <p className="text-xs text-sec">Blocked but fixable</p>
          <p className="mt-0.5 text-xl text-ink">{money(worth.fixable)}</p>
          <p className="mt-0.5 text-xs text-ter">someone could ask</p>
        </div>
        <div className="rounded-lg border border-sep px-3 py-2">
          <p className="text-xs text-sec">Past the deadline</p>
          <p className="mt-0.5 text-xl text-ter">{money(worth.lost)}</p>
          <p className="mt-0.5 text-xs text-ter">four years gone</p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-sec">
            From
            <input
              type="date"
              value={span.from}
              onChange={(e) => setSpan({ ...span, from: e.target.value })}
              className="mt-1 block rounded-md border border-sep px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-sec">
            To
            <input
              type="date"
              value={span.to}
              onChange={(e) => setSpan({ ...span, to: e.target.value })}
              className="mt-1 block rounded-md border border-sep px-2 py-1 text-sm"
            />
          </label>
          <p className="text-xs text-ter">
            {view.from} to {view.to}
          </p>
        </div>

        <div className="rounded-lg border border-sep px-3 py-2 text-sm">
          <p className="text-ink">
            {view.summary.giftCount} gift{view.summary.giftCount === 1 ? "" : "s"} ·{" "}
            {money(view.summary.donationTotal)} given · <strong>{money(view.summary.claimTotal)}</strong> to
            claim
          </p>
          {view.summary.giftCount > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Claim ${money(view.summary.claimTotal)} on ${view.summary.giftCount} gifts?`))
                    return;
                  const done = await send({ action: "claim", from: view.from, to: view.to });
                  if (done) setNote("Claim prepared. Download the schedule and send it to HMRC.");
                }}
                className="btn-primary rounded-md px-3 py-1.5 text-xs text-white disabled:opacity-60"
              >
                Prepare a claim
              </button>
              <a
                href={`/api/admin/giving/gift-aid/schedule?from=${view.from}&to=${view.to}`}
                className="rounded-md border border-sep px-3 py-1.5 text-xs text-ink"
              >
                Download the schedule
              </a>
            </div>
          )}
        </div>
      </section>

      {view.blocked.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">What isn&apos;t being claimed</h2>
          <ul className="space-y-1 text-sm">
            {view.blocked.map((row) => (
              <li key={row.reason} className="flex flex-wrap justify-between gap-2 border-b border-sep pb-1">
                <span className={row.fixable ? "text-ink" : "text-sec"}>
                  {row.label}
                  {row.fixable && <span className="ml-2 text-xs text-amber-700">somebody could ask</span>}
                </span>
                <span className="text-sec">
                  {row.gifts} gift{row.gifts === 1 ? "" : "s"} · {money(row.amount)} ·{" "}
                  <strong className="text-ink">{money(row.worth)}</strong> unclaimed
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.expiring.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">Running out of time</h2>
          <ul className="text-xs text-sec">
            {view.expiring.slice(0, 8).map((row) => (
              <li key={row.giftId}>
                {money(row.amount)} given {row.givenAt} — claim by {row.deadline}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Declarations</h2>
        {data.view.awaitingLetter > 0 && (
          <p className="text-xs text-amber-700">
            {data.view.awaitingLetter} verbal declaration
            {data.view.awaitingLetter === 1 ? " is" : "s are"} still owed a written confirmation.
          </p>
        )}
        <ul className="space-y-1 text-xs">
          {data.declarations.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
              <span className="text-ink">
                {row.firstName} {row.lastName}
              </span>
              <span className="text-ter">
                {row.houseNumber}, {row.postcode}
              </span>
              <span className="text-sec">
                {row.how.toLowerCase()} · {row.madeOn}
                {row.coversPast ? " · covers earlier gifts" : " · from that date only"}
              </span>
              {row.withdrawnOn ? (
                <span className="text-red-600">withdrawn {row.withdrawnOn}</span>
              ) : (
                <button
                  disabled={busy}
                  onClick={async () => {
                    const on = window.prompt("Withdrawn from which date? (YYYY-MM-DD)");
                    if (!on) return;
                    await send({ action: "withdraw", declarationId: row.id, on });
                  }}
                  className="text-accent hover:underline"
                >
                  withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.declarations.length === 0 && <p className="text-sm text-sec">None on file yet.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Record a declaration</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await send({ action: "declare", ...form });
            if (done) setForm({ ...form, personId: "", firstName: "", lastName: "", houseNumber: "", postcode: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <input
            required
            value={form.personId}
            onChange={(e) => setForm({ ...form, personId: e.target.value })}
            placeholder="Who (person id)"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <label className="text-xs text-sec">
            Signed on
            <input
              type="date"
              required
              value={form.madeOn}
              onChange={(e) => setForm({ ...form, madeOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <input
            required
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder="Forename"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            placeholder="Surname"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={form.houseNumber}
            onChange={(e) => setForm({ ...form, houseNumber: e.target.value })}
            placeholder="House name or number"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={form.postcode}
            onChange={(e) => setForm({ ...form, postcode: e.target.value })}
            placeholder="Postcode"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <label className="text-xs text-sec">
            How it was made
            <select
              value={form.how}
              onChange={(e) => setForm({ ...form, how: e.target.value as Method })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="PAPER">On paper</option>
              <option value="ONLINE">Online</option>
              <option value="VERBAL">Verbally — needs a letter</option>
            </select>
          </label>
          <label className="flex items-end gap-2 text-xs text-sec">
            <input
              type="checkbox"
              checked={form.coversPast}
              onChange={(e) => setForm({ ...form, coversPast: e.target.checked })}
            />
            Covers gifts already given (four years back)
          </label>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-2"
          >
            Record it
          </button>
        </form>
        <p className="text-xs text-ter">
          The name and address are kept as declared, not read from the household — HMRC wants the
          address the declaration was made from, and a family that moves must not change a claim
          already sent.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Claims</h2>
        <ul className="space-y-1 text-xs">
          {data.claims.map((claim) => (
            <li key={claim.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
              <span className="text-ink">{money(claim.claimTotal)}</span>
              <span className="text-sec">
                on {money(claim.donationTotal)} from {claim.giftCount} gift
                {claim.giftCount === 1 ? "" : "s"} · {claim.from} to {claim.to}
              </span>
              <span className="text-ter">
                {claim.settledOn
                  ? `paid ${claim.settledOn}`
                  : claim.submittedOn
                    ? `sent ${claim.submittedOn}`
                    : "not sent"}
                {claim.reference && ` · ${claim.reference}`}
              </span>
              {!claim.submittedOn && (
                <>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const on = window.prompt("Sent to HMRC on? (YYYY-MM-DD)");
                      if (!on) return;
                      const reference = window.prompt("Their reference, if you have one") ?? "";
                      await send({ action: "update-claim", claimId: claim.id, submittedOn: on, reference });
                    }}
                    className="text-accent hover:underline"
                  >
                    mark sent
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm("Delete this unsent claim and release its gifts?")) return;
                      await send(null, "DELETE", `?claimId=${claim.id}`);
                    }}
                    className="text-ter hover:underline"
                  >
                    delete
                  </button>
                </>
              )}
              {claim.submittedOn && !claim.settledOn && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    const on = window.prompt("Paid on? (YYYY-MM-DD)");
                    if (!on) return;
                    await send({ action: "update-claim", claimId: claim.id, settledOn: on });
                  }}
                  className="text-accent hover:underline"
                >
                  mark paid
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.claims.length === 0 && <p className="text-sm text-sec">Nothing claimed yet.</p>}
      </section>
    </div>
  );
}
