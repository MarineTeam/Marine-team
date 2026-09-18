"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/giving";

type Fund = { id: string; name: string; active: boolean; taxDeductible: boolean };
type Gift = {
  id: string;
  amount: number;
  currency: string;
  status: "SETTLED" | "REFUNDED";
  source: string;
  givenAt: string;
  note: string | null;
  message: string | null;
  externalId: string | null;
  fund: { name: string };
  giver: { id: string; displayName: string } | null;
};
type Loaded = {
  taxYear: number;
  summary: { total: number; gifts: number; funds: { fundId: string; fundName: string; amount: number; gifts: number }[] };
  gifts: Gift[];
  funds: Fund[];
};

/** The reconciliation view, and typing in what didn't arrive online. */
export function GivingManager() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [source, setSource] = useState("CASH");
  const [givenAt, setGivenAt] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/giving");
    if (response.ok) setData(await response.json());
    else setError("Couldn't load the gifts.");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/giving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, fundId, source, givenAt }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't record that.");
      setAmount("");
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't record that.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-sec">Loading…</p>;
  const currency = data.gifts[0]?.currency ?? "GBP";

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-sep p-4">
        <p className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
          Tax year {data.taxYear}/{String(data.taxYear + 1).slice(2)}
        </p>
        <p className="mt-1 text-2xl font-semibold text-ink">{formatMoney(data.summary.total, currency)}</p>
        <p className="text-sm text-sec">{data.summary.gifts} gifts</p>
        <ul className="mt-3 space-y-1 text-sm">
          {data.summary.funds.map((fund) => (
            <li key={fund.fundId} className="flex justify-between">
              <span className="text-sec">{fund.fundName}</span>
              <span className="text-ink">{formatMoney(fund.amount, currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={add} className="space-y-3 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-semibold text-ink">Record cash or a cheque</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25.00"
            inputMode="decimal"
            required
            className="w-28 rounded-md border border-sep px-3 py-1.5"
          />
          <select
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
            required
            className="rounded-md border border-sep px-2 py-1.5"
          >
            <option value="">Fund…</option>
            {data.funds.filter((fund) => fund.active).map((fund) => (
              <option key={fund.id} value={fund.id}>{fund.name}</option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-sep px-2 py-1.5">
            <option value="CASH">Cash</option>
            <option value="CHEQUE">Cheque</option>
            <option value="BANK_TRANSFER">Transfer</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            type="date"
            value={givenAt}
            onChange={(e) => setGivenAt(e.target.value)}
            className="rounded-md border border-sep px-2 py-1.5"
          />
          <button type="submit" disabled={busy} className="btn-primary rounded-md px-3 py-1.5 text-white disabled:opacity-60">
            Record
          </button>
        </div>
      </form>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-ink">Gifts</h2>
        <ul className="space-y-1 text-sm">
          {data.gifts.map((gift) => (
            <li key={gift.id} className="flex items-baseline justify-between gap-3 rounded-md border border-sep px-3 py-2">
              <span>
                <span className={gift.status === "REFUNDED" ? "text-ter line-through" : "text-ink"}>
                  {formatMoney(gift.amount, gift.currency)}
                </span>
                <span className="text-sec"> · {gift.fund.name}</span>
                {gift.giver ? (
                  <span className="text-sec"> · {gift.giver.displayName}</span>
                ) : (
                  <span className="text-ter"> · not attributed</span>
                )}
                {gift.message && <span className="block text-xs text-ter">“{gift.message}”</span>}
              </span>
              <span className="shrink-0 text-xs text-ter">
                {gift.givenAt.slice(0, 10)} · {gift.source.toLowerCase().replace("_", " ")}
                {gift.status === "REFUNDED" ? " · refunded" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
