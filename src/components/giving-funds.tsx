"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";

type Fund = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  taxDeductible: boolean;
  restricted: boolean;
};

type Balance = {
  fundId: string;
  name: string;
  restricted: boolean;
  given: number;
  movedIn: number;
  movedOut: number;
  spent: number;
  committed: number;
  awaiting: number;
  balance: number;
  available: number;
  overdrawn: boolean;
};

type TransferRow = {
  id: string;
  amount: number;
  movedOn: string;
  authority: string;
  note: string | null;
  fromName: string;
  toName: string;
};

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    minor / 100,
  );

/**
 * Funds: what money can be given to, what is left in each, and what belongs on
 * a statement.
 *
 * The figure this screen exists to show is *available* — what is in the fund
 * once the bills somebody has already agreed to are counted. A church reading
 * only the balance commits the same money twice, quite innocently, three weeks
 * apart. Both are shown, and never added.
 */
export function GivingFunds() {
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [move, setMove] = useState({ fromFundId: "", toFundId: "", amount: "", authority: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/giving/funds");
    if (!response.ok) return setError("Couldn't load the funds.");
    const body = await response.json();
    setFunds(body.funds);
    setBalances(body.balances ?? []);
    setTransfers(body.transfers ?? []);
  }, []);

  useEffect(() => {
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

  if (!funds) return <LoadState error={error} />;

  const balanceOf = (id: string) => balances.find((row) => row.fundId === id);
  const open = funds.filter((fund) => fund.active);

  return (
    <div className="space-y-6">
      {error && <Problem>{error}</Problem>}

      <ul aria-label="Funds" className="space-y-2">
        {funds.map((fund) => {
          const balance = balanceOf(fund.id);
          return (
            <li key={fund.id} className="rounded-lg border border-sep px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={fund.active ? "text-ink" : "text-ter"}>
                  {fund.name}
                  {fund.restricted && (
                    <span className="ml-2 rounded border border-accent px-1 text-xs text-accent">
                      restricted
                    </span>
                  )}
                  {!fund.active && <span className="text-ter"> · closed</span>}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1 text-sec">
                    <input
                      type="checkbox"
                      checked={fund.taxDeductible}
                      disabled={busy}
                      onChange={(e) =>
                        send(`/api/admin/giving/funds/${fund.id}`, "PATCH", { taxDeductible: e.target.checked })
                      }
                    />
                    on statements
                  </label>
                  <label className="flex items-center gap-1 text-sec">
                    <input
                      type="checkbox"
                      checked={fund.restricted}
                      disabled={busy}
                      onChange={async (e) => {
                        // A restriction without a stated purpose cannot be
                        // enforced, so it is asked for here rather than
                        // refused later by the server alone.
                        if (e.target.checked && !fund.description?.trim()) {
                          const purpose = window.prompt(
                            `What was ${fund.name} given for? A restricted fund needs a stated purpose — nothing else says which costs are within it.`,
                          );
                          if (!purpose?.trim()) return;
                          await send(`/api/admin/giving/funds/${fund.id}`, "PATCH", {
                            restricted: true,
                            description: purpose,
                          });
                          return;
                        }
                        await send(`/api/admin/giving/funds/${fund.id}`, "PATCH", {
                          restricted: e.target.checked,
                        });
                      }}
                    />
                    restricted
                  </label>
                  <button
                    disabled={busy}
                    onClick={() => send(`/api/admin/giving/funds/${fund.id}`, "PATCH", { active: !fund.active })}
                    className="text-ter hover:underline"
                  >
                    {fund.active ? "Close" : "Reopen"}
                  </button>
                </span>
              </div>

              {fund.description && <p className="mt-1 text-xs text-ter">for {fund.description}</p>}

              {balance && (
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 text-xs">
                  <span className="text-ink">
                    {money(balance.balance)} <span className="text-ter">in the fund</span>
                  </span>
                  <span className={balance.overdrawn ? "text-red-600" : "text-sec"}>
                    {money(balance.available)}{" "}
                    <span className={balance.overdrawn ? "text-red-600" : "text-ter"}>
                      once agreed bills land
                    </span>
                  </span>
                  <span className="text-ter">
                    {money(balance.given)} given, {money(balance.spent)} spent
                    {balance.committed > 0 && `, ${money(balance.committed)} agreed`}
                    {balance.awaiting > 0 && `, ${money(balance.awaiting)} awaiting approval`}
                    {balance.movedIn > 0 && `, ${money(balance.movedIn)} moved in`}
                    {balance.movedOut > 0 && `, ${money(balance.movedOut)} moved out`}
                  </span>
                </div>
              )}

              {balance?.overdrawn && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {balance.restricted
                    ? `${money(-balance.available)} overcommitted. Money given for one purpose has been committed to another — put it right before it is paid.`
                    : `${money(-balance.available)} overcommitted once the agreed bills land.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await send("/api/admin/giving/funds", "POST", { name })) setName("");
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New fund"
          required
          maxLength={120}
          className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Add
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Move money between funds</h2>
        <p className="text-xs text-ter">
          Say what permits it — a trustee minute, a donor&apos;s agreement. Moving money out of a
          restricted fund is the entry somebody has to explain years later, so the reason is
          required rather than optional. A transfer entered in error is corrected by one the other
          way: both stay on the record.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send("/api/admin/giving/transfers", "POST", {
              fromFundId: move.fromFundId,
              toFundId: move.toFundId,
              amount: Math.round(Number(move.amount) * 100),
              authority: move.authority,
            });
            if (ok) setMove({ ...move, amount: "", authority: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="text-xs text-sec">
            Out of
            <select
              required
              value={move.fromFundId}
              onChange={(e) => setMove({ ...move, fromFundId: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {open.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-sec">
            Into
            <select
              required
              value={move.toFundId}
              onChange={(e) => setMove({ ...move, toFundId: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {open.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <input
            required
            type="number"
            min={0.01}
            step={0.01}
            value={move.amount}
            onChange={(e) => setMove({ ...move, amount: e.target.value })}
            placeholder="Amount in pounds"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={move.authority}
            onChange={(e) => setMove({ ...move, authority: e.target.value })}
            placeholder="What permits it — e.g. Trustees, 4 March"
            maxLength={300}
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-sep px-3 py-1.5 text-sm text-ink disabled:opacity-60 sm:col-span-2"
          >
            Move it
          </button>
        </form>

        {transfers.length > 0 && (
          <ul aria-label="Past transfers" className="space-y-1 text-xs">
            {transfers.map((transfer) => (
              <li key={transfer.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                <span className="text-ink">{money(transfer.amount)}</span>
                <span className="text-sec">
                  {transfer.fromName} → {transfer.toName}
                </span>
                <span className="text-ter">{transfer.movedOn}</span>
                <span className="text-ter">{transfer.authority}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
