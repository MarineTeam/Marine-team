"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/giving";

type Statement = {
  householdId: string;
  householdName: string;
  taxYear: number;
  from: string;
  to: string;
  currency: string;
  lines: { date: string; fundName: string; amount: number }[];
  total: number;
  excludedTotal: number;
};

/** One statement per household, ready to print. */
export function GivingStatements() {
  const [year, setYear] = useState<number | null>(null);
  const [statements, setStatements] = useState<Statement[] | null>(null);

  const load = useCallback(async (taxYear?: number) => {
    const response = await fetch(`/api/admin/giving/statements${taxYear ? `?taxYear=${taxYear}` : ""}`);
    if (!response.ok) return;
    const body = await response.json();
    setYear(body.taxYear);
    setStatements(body.statements);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!statements || year === null) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm print:hidden">
        <button onClick={() => load(year - 1)} className="rounded-md border border-sep px-2 py-1">←</button>
        <span className="text-ink">
          {year}/{String(year + 1).slice(2)}
        </span>
        <button onClick={() => load(year + 1)} className="rounded-md border border-sep px-2 py-1">→</button>
        <span className="text-ter">{statements.length} households</span>
      </div>

      {statements.length === 0 && <p className="text-sm text-sec">Nothing was given in that year.</p>}

      {statements.map((statement) => (
        <article key={statement.householdId} className="break-inside-avoid rounded-lg border border-sep p-4">
          <h2 className="font-medium text-ink">{statement.householdName}</h2>
          <p className="text-xs text-sec">
            {statement.from} to {statement.to}
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {statement.lines.map((line, at) => (
                <tr key={at}>
                  <td className="py-0.5 text-sec">{line.date}</td>
                  <td className="py-0.5 text-sec">{line.fundName}</td>
                  <td className="py-0.5 text-right text-ink">{formatMoney(line.amount, statement.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 flex justify-between border-t border-sep pt-2 text-sm font-medium text-ink">
            <span>Total</span>
            <span>{formatMoney(statement.total, statement.currency)}</span>
          </p>
          {statement.excludedTotal > 0 && (
            // Said out loud rather than quietly dropped: somebody comparing
            // this to their bank statement needs the difference explained.
            <p className="mt-1 text-xs text-ter">
              A further {formatMoney(statement.excludedTotal, statement.currency)} was given to funds that
              don&apos;t appear on a statement.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
