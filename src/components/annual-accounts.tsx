"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";

type Column = { restricted: number; unrestricted: number; total: number };
type AccountLine = { name: string; amounts: Column };

type StatementLine = { name: string; amounts: Column; carriedFrom: string | null };

type Held = {
  asAt: string;
  label: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  totalAssets: Column;
  totalLiabilities: Column;
  netAssets: Column;
  stale: StatementLine[];
};

type Holding = {
  id: string;
  name: string;
  kind: "ASSET" | "LIABILITY";
  amount: number;
  asAt: string;
  note: string | null;
  fundName: string | null;
};

type Accounts = {
  from: string;
  to: string;
  label: string;
  opening: Column;
  receipts: AccountLine[];
  totalReceipts: Column;
  payments: AccountLine[];
  totalPayments: Column;
  transfers: Column;
  closing: Column;
  owed: Column;
  reconciles: boolean;
};

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);

const YEAR_STARTS = [
  { month: 1, day: 1, label: "1 January" },
  { month: 4, day: 1, label: "1 April" },
  { month: 4, day: 6, label: "6 April" },
  { month: 9, day: 1, label: "1 September" },
];

/**
 * Receipts and payments for a financial year.
 *
 * Three columns, and the two outer ones are the point: restricted money and
 * unrestricted money are different money, and a single total column is how a
 * roof appeal pays for the heating. The total is given as well, because that
 * is the figure that reconciles against a bank statement — but it is last.
 */
export function AnnualAccounts() {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState({
    name: "",
    kind: "ASSET" as "ASSET" | "LIABILITY",
    amount: "",
    note: "",
  });
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [start, setStart] = useState(YEAR_STARTS[0]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ startMonth: String(start.month), startDay: String(start.day) });
    if (year !== null) params.set("year", String(year));
    const response = await fetch(`/api/admin/giving/accounts?${params}`);
    if (!response.ok) return setError("Couldn't load the accounts.");
    const body = await response.json();
    setAccounts(body.accounts);
    setHeld(body.held);
    setHoldings(body.holdings ?? []);
    setYears(body.years);
    setError(null);
  }, [year, start]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/giving/accounts", {
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

  if (!accounts) return <LoadState error={error} />;

  const csv = `/api/admin/giving/accounts?format=csv&year=${encodeURIComponent(
    year ?? years[0] ?? "",
  )}&startMonth=${start.month}&startDay=${start.day}`;

  const row = (name: string, amounts: Column, emphasis = false) => (
    <tr key={name} className={emphasis ? "border-t border-sep font-medium text-ink" : "text-sec"}>
      <th scope="row" className="py-1 pr-3 text-left font-normal">
        {name}
      </th>
      <td className="py-1 pl-3 text-right tabular-nums">{money(amounts.restricted)}</td>
      <td className="py-1 pl-3 text-right tabular-nums">{money(amounts.unrestricted)}</td>
      <td className="py-1 pl-3 text-right tabular-nums text-ink">{money(amounts.total)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      {error && <Problem>{error}</Problem>}

      {!accounts.reconciles && (
        <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600" role="alert">
          These figures do not reconcile: the closing balance worked out from the year&apos;s
          movements disagrees with the one worked out from the whole history. Something is wrong
          with the report rather than with the church — please say so rather than filing this.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-sec">
          Year
          <select
            value={year ?? years[0] ?? ""}
            onChange={(event) => setYear(Number(event.target.value))}
            className="mt-1 block rounded-md border border-sep px-3 py-1.5 text-sm"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-sec">
          Year begins
          <select
            value={`${start.month}-${start.day}`}
            onChange={(event) => {
              const [month, day] = event.target.value.split("-").map(Number);
              setStart(YEAR_STARTS.find((option) => option.month === month && option.day === day) ?? YEAR_STARTS[0]);
            }}
            className="mt-1 block rounded-md border border-sep px-3 py-1.5 text-sm"
          >
            {YEAR_STARTS.map((option) => (
              <option key={option.label} value={`${option.month}-${option.day}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <a href={csv} className="rounded-md border border-sep px-3 py-1.5 text-sm text-ink hover:underline">
          Download as a spreadsheet
        </a>
      </div>

      <p className="text-xs text-ter">
        {accounts.label} · {accounts.from} to {accounts.to} · counted on the day the money moved,
        which is not the day a cost was incurred
      </p>

      <table className="w-full text-sm">
        <caption className="sr-only">Receipts and payments for {accounts.label}</caption>
        <thead>
          <tr className="text-xs text-ter">
            <th scope="col" className="pb-1 pr-3 text-left font-normal">
              Line
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-normal">
              Restricted
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-normal">
              Unrestricted
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-normal">
              Total
            </th>
          </tr>
        </thead>
        <tbody>{row("Opening balance", accounts.opening, true)}</tbody>

        {/* A tbody per section, so each heading is a row-group label rather
            than a fourth column heading — which is what `scope="colgroup"`
            would make it, and what a screen reader would then announce. */}
        <tbody>
          <tr>
            <th scope="rowgroup" colSpan={4} className="pt-3 pb-1 text-left text-xs font-semibold text-ink">
              Receipts
            </th>
          </tr>
          {accounts.receipts.map((line) => row(line.name, line.amounts))}
          {accounts.receipts.length === 0 && (
            <tr className="text-sec">
              <td colSpan={4} className="py-1">
                Nothing came in.
              </td>
            </tr>
          )}
          {row("Total receipts", accounts.totalReceipts, true)}
        </tbody>

        <tbody>
          <tr>
            <th scope="rowgroup" colSpan={4} className="pt-3 pb-1 text-left text-xs font-semibold text-ink">
              Payments
            </th>
          </tr>
          {accounts.payments.map((line) => row(line.name, line.amounts))}
          {accounts.payments.length === 0 && (
            <tr className="text-sec">
              <td colSpan={4} className="py-1">
                Nothing went out.
              </td>
            </tr>
          )}
          {row("Total payments", accounts.totalPayments, true)}
        </tbody>

        <tbody>
          {(accounts.transfers.restricted !== 0 || accounts.transfers.unrestricted !== 0) &&
            row("Transfers between funds", accounts.transfers)}
          {row("Closing balance", accounts.closing, true)}
        </tbody>
      </table>

      {held && (
        <section className="space-y-2 border-t border-sep pt-4">
          <h2 className="text-sm font-semibold text-ink">Assets and liabilities at {held.asAt}</h2>
          <p className="text-xs text-ter">
            The second statement a receipts-and-payments charity files, and an examiner asks for
            both. The cash below is the closing balance above — taken, not worked out again, so the
            two cannot disagree about the one figure they share.
          </p>

          {held.stale.length > 0 && (
            <p className="rounded-md border border-amber-300 px-3 py-2 text-xs text-amber-700" role="status">
              {held.stale.length === 1 ? "One figure is" : `${held.stale.length} figures are`} carried
              forward from an earlier year end:{" "}
              {held.stale.map((line) => `${line.name} (${line.carriedFrom})`).join(", ")}. A
              valuation that is silently years old is worth a look.
            </p>
          )}

          <table className="w-full text-sm">
            <caption className="sr-only">Assets and liabilities at {held.asAt}</caption>
            <thead>
              <tr className="text-xs text-ter">
                <th scope="col" className="pb-1 pr-3 text-left font-normal">
                  Line
                </th>
                <th scope="col" className="pb-1 pl-3 text-right font-normal">
                  Restricted
                </th>
                <th scope="col" className="pb-1 pl-3 text-right font-normal">
                  Unrestricted
                </th>
                <th scope="col" className="pb-1 pl-3 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="rowgroup" colSpan={4} className="pt-2 pb-1 text-left text-xs font-semibold text-ink">
                  What the church holds
                </th>
              </tr>
              {held.assets.map((item) =>
                row(
                  item.carriedFrom ? `${item.name} (carried forward from ${item.carriedFrom})` : item.name,
                  item.amounts,
                ),
              )}
              {row("Total assets", held.totalAssets, true)}
            </tbody>
            <tbody>
              <tr>
                <th scope="rowgroup" colSpan={4} className="pt-3 pb-1 text-left text-xs font-semibold text-ink">
                  What it owes
                </th>
              </tr>
              {held.liabilities.map((item) =>
                row(
                  item.carriedFrom ? `${item.name} (carried forward from ${item.carriedFrom})` : item.name,
                  item.amounts,
                ),
              )}
              {held.liabilities.length === 0 && (
                <tr className="text-sec">
                  <td colSpan={4} className="py-1">
                    Nothing owed.
                  </td>
                </tr>
              )}
              {row("Total liabilities", held.totalLiabilities, true)}
            </tbody>
            <tbody>{row("Net assets", held.netAssets, true)}</tbody>
          </table>

          <h3 className="pt-2 text-xs font-semibold text-ink">What has to be typed in</h3>
          <p className="text-xs text-ter">
            The building, the minibus, a loan — nothing in this app can work those out. Entered
            against a year end rather than kept as one current value, because a building valued in
            2024 is not evidence of its 2026 value.
          </p>
          <ul aria-label="Entered holdings" className="space-y-1 text-xs">
            {holdings.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                <span className="text-ink">{item.name}</span>
                <span className="text-sec">{money(item.amount)}</span>
                <span className="text-ter">
                  {item.kind === "ASSET" ? "held" : "owed"} at {item.asAt}
                </span>
                {item.fundName && <span className="text-ter">{item.fundName}</span>}
                <button
                  disabled={busy}
                  onClick={() => send({ action: "forget", id: item.id })}
                  className="text-ter hover:underline"
                >
                  forget it
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await send({
                action: "holding",
                name: entry.name,
                kind: entry.kind,
                amount: Math.round(Number(entry.amount) * 100),
                asAt: held.asAt,
                note: entry.note || undefined,
              });
              if (ok) setEntry({ ...entry, name: "", amount: "", note: "" });
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <input
              required
              value={entry.name}
              onChange={(event) => setEntry({ ...entry, name: event.target.value })}
              placeholder="What it is — the hall, the minibus, a loan"
              maxLength={120}
              className="rounded-md border border-sep px-3 py-1.5 text-sm"
            />
            <label className="text-xs text-sec">
              Held or owed
              <select
                value={entry.kind}
                onChange={(event) =>
                  setEntry({ ...entry, kind: event.target.value as "ASSET" | "LIABILITY" })
                }
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              >
                <option value="ASSET">the church holds it</option>
                <option value="LIABILITY">the church owes it</option>
              </select>
            </label>
            <input
              required
              type="number"
              min={0.01}
              step={0.01}
              value={entry.amount}
              onChange={(event) => setEntry({ ...entry, amount: event.target.value })}
              placeholder="Amount in pounds"
              className="rounded-md border border-sep px-3 py-1.5 text-sm"
            />
            <input
              value={entry.note}
              onChange={(event) => setEntry({ ...entry, note: event.target.value })}
              placeholder="Where the figure came from (optional)"
              maxLength={500}
              className="rounded-md border border-sep px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-sep px-3 py-1.5 text-sm text-ink disabled:opacity-60 sm:col-span-2"
            >
              Record it at {held.asAt}
            </button>
          </form>

          <a
            href={`${csv}&of=holdings`}
            className="inline-block rounded-md border border-sep px-3 py-1.5 text-sm text-ink hover:underline"
          >
            Download assets and liabilities as a spreadsheet
          </a>
        </section>
      )}

      <section className="space-y-1 border-t border-sep pt-3">
        <h2 className="text-sm font-semibold text-ink">Agreed and not yet paid at the year end</h2>
        <p className="text-xs text-ter">
          Owed, not spent — so it is outside the figures above, which count only money that moved.
          A statement that counted it would not add up against the bank; one that left it out
          entirely would hide what the church owes.
        </p>
        <p className="text-sm text-ink tabular-nums">
          {money(accounts.owed.total)}
          {accounts.owed.restricted !== 0 && (
            <span className="text-ter"> · {money(accounts.owed.restricted)} of it restricted</span>
          )}
        </p>
      </section>
    </div>
  );
}
