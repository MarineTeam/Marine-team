"use client";

import { useCallback, useEffect, useState } from "react";

type Fund = { id: string; name: string; description: string | null; active: boolean; taxDeductible: boolean };

/** Funds: what money can be given to, and what belongs on a statement. */
export function GivingFunds() {
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/giving/funds");
    if (response.ok) setFunds((await response.json()).funds);
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
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!funds) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {funds.map((fund) => (
          <li key={fund.id} className="flex items-center justify-between gap-3 rounded-lg border border-sep px-3 py-2 text-sm">
            <span className={fund.active ? "text-ink" : "text-ter"}>
              {fund.name}
              {!fund.active && <span className="text-ter"> · closed</span>}
            </span>
            <span className="flex gap-3 text-xs">
              <label className="flex items-center gap-1 text-sec">
                <input
                  type="checkbox"
                  checked={fund.taxDeductible}
                  disabled={busy}
                  onChange={(e) => send(`/api/admin/giving/funds/${fund.id}`, "PATCH", { taxDeductible: e.target.checked })}
                />
                on statements
              </label>
              <button
                disabled={busy}
                onClick={() => send(`/api/admin/giving/funds/${fund.id}`, "PATCH", { active: !fund.active })}
                className="text-ter hover:underline"
              >
                {fund.active ? "Close" : "Reopen"}
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await send("/api/admin/giving/funds", "POST", { name });
          setName("");
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
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60">
          Add
        </button>
      </form>
    </div>
  );
}
