"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";
import { slugify } from "@/lib/slug";

type Status = "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";

type Row = {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  payee: string;
  description: string;
  incurredOn: string;
  status: Status;
  claimantId: string | null;
  claimant: string | null;
  approvedByEmail: string | null;
  rejectedReason: string | null;
  receiptRef: string | null;
  paidOn: string | null;
  paidMethod: string | null;
};

type Category = { id: string; name: string; slug: string; annualBudget: number | null; active: boolean };

type View = {
  from: string;
  to: string;
  spend: { committed: number; paid: number; awaiting: number; againstBudget: number };
  byCategory: {
    categoryId: string;
    name: string;
    budget: number | null;
    spend: { committed: number; paid: number; awaiting: number; againstBudget: number };
    remaining: number | null;
    fractionUsed: number | null;
    over: boolean;
  }[];
  position: {
    received: number;
    paidOut: number;
    net: number;
    committed: number;
    netAfterCommitments: number;
  };
  waiting: Row[];
  owing: Row[];
  recent: Row[];
};

const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );

/**
 * Money out.
 *
 * Two things this screen must not let somebody do: read a commitment as money
 * that has gone, and approve their own claim. The first is handled by never
 * showing a single "spent" figure; the second by the server, which refuses —
 * but the screen says so plainly rather than offering a button that fails.
 */
export function ExpensesManager({ meId }: { meId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState({ name: "", budget: "" });

  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    payee: "",
    description: "",
    incurredOn: "",
    receiptRef: "",
  });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/expenses");
    if (!response.ok) return setError("Couldn't load the expenses.");
    const body = await response.json();
    setView(body.view);
    setCategories(body.categories);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/expenses", {
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

  if (!view) return <LoadState error={error} />;

  const { position } = view;
  // A turned-down claim is in neither queue, so without this it vanishes and
  // the promise that a refusal can be undone is one nothing on screen keeps.
  const rejected = view.recent.filter((row) => row.status === "REJECTED");

  return (
    <div className="space-y-6">
      {error && <Problem>{error}</Problem>}

      <section className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-sep px-3 py-2">
          <p className="text-xs text-sec">Received</p>
          <p className="mt-0.5 text-xl text-ink">{money(position.received)}</p>
        </div>
        <div className="rounded-lg border border-sep px-3 py-2">
          <p className="text-xs text-sec">Paid out</p>
          <p className="mt-0.5 text-xl text-ink">{money(position.paidOut)}</p>
          <p className="mt-0.5 text-xs text-ter">money that has left</p>
        </div>
        <div className="rounded-lg border border-sep px-3 py-2">
          <p className="text-xs text-sec">Agreed, not yet paid</p>
          <p className="mt-0.5 text-xl text-sec">{money(position.committed)}</p>
          <p className="mt-0.5 text-xs text-ter">still in the account</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${position.netAfterCommitments < 0 ? "border-red-300" : "border-accent"}`}>
          <p className="text-xs text-sec">Position</p>
          <p className="mt-0.5 text-xl text-ink">{money(position.net)}</p>
          <p className="mt-0.5 text-xs text-ter">
            {money(position.netAfterCommitments)} once the agreed bills land
          </p>
        </div>
      </section>

      {view.waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">
            Waiting for somebody ({view.waiting.length})
          </h2>
          <p className="text-xs text-ter">
            Oldest first — a volunteer who is out of pocket is out of pocket, whatever the amount.
          </p>
          <ul className="space-y-1 text-xs">
            {view.waiting.map((row) => {
              const mine = row.claimantId !== null && row.claimantId === meId;
              return (
                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                  <span className="text-ink">{money(row.amount)}</span>
                  <span className="text-sec">
                    {row.payee} · {row.description}
                  </span>
                  <span className="text-ter">
                    {row.categoryName} · {row.incurredOn}
                    {row.claimant && ` · claimed by ${row.claimant}`}
                  </span>
                  {mine ? (
                    // Said rather than offered: a button that always fails is
                    // worse than no button.
                    <span className="text-ter">your own claim — somebody else has to approve it</span>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => send({ action: "approve", expenseId: row.id })}
                        className="rounded-md border border-sep px-2 py-0.5 text-ink"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          const reason = window.prompt("Why is it being turned down?");
                          if (!reason?.trim()) return;
                          await send({ action: "reject", expenseId: row.id, reason });
                        }}
                        className="text-ter hover:underline"
                      >
                        turn down
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view.owing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Agreed and not yet paid</h2>
          <ul className="space-y-1 text-xs">
            {view.owing.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                <span className="text-ink">{money(row.amount)}</span>
                <span className="text-sec">{row.payee}</span>
                <span className="text-ter">
                  {row.categoryName}
                  {row.approvedByEmail && ` · approved by ${row.approvedByEmail}`}
                </span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    const paidOn = window.prompt("Paid on? (YYYY-MM-DD)");
                    if (!paidOn) return;
                    const method = window.prompt("How? (optional)") ?? "";
                    await send({ action: "pay", expenseId: row.id, paidOn, method });
                  }}
                  className="rounded-md border border-sep px-2 py-0.5 text-ink"
                >
                  Mark paid
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Against budget</h2>
        <ul className="space-y-1 text-xs">
          {view.byCategory.map((row) => (
            <li key={row.categoryId} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
              <span className={row.over ? "text-red-600" : "text-ink"}>{row.name}</span>
              <span className="text-sec">
                {money(row.spend.againstBudget)}
                {row.budget !== null && ` of ${money(row.budget)}`}
              </span>
              {row.fractionUsed !== null && (
                <span className={row.over ? "text-red-600" : "text-ter"}>
                  {Math.round(row.fractionUsed * 100)}%
                </span>
              )}
              {row.remaining !== null && (
                <span className="text-ter">
                  {row.remaining < 0
                    ? `${money(-row.remaining)} over`
                    : `${money(row.remaining)} left`}
                </span>
              )}
              <span className="text-ter">
                ({money(row.spend.paid)} paid, {money(row.spend.committed)} agreed)
              </span>
            </li>
          ))}
        </ul>
        {view.byCategory.length === 0 && <p className="text-sm text-sec">No categories yet.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Record a cost</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send({
              action: "expense",
              categoryId: form.categoryId,
              amount: Math.round(Number(form.amount) * 100),
              payee: form.payee,
              description: form.description,
              incurredOn: form.incurredOn,
              receiptRef: form.receiptRef || undefined,
            });
            if (ok) setForm({ ...form, amount: "", payee: "", description: "", receiptRef: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="text-xs text-sec">
            Category
            <select
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {categories.filter((c) => c.active).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <input
            required
            type="number"
            min={0.01}
            step={0.01}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Amount in pounds"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={form.payee}
            onChange={(e) => setForm({ ...form, payee: e.target.value })}
            placeholder="Who was paid"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <label className="text-xs text-sec">
            When it was incurred
            <input
              type="date"
              required
              value={form.incurredOn}
              onChange={(e) => setForm({ ...form, incurredOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <input
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What it was for"
            className="rounded-md border border-sep px-3 py-1.5 text-sm sm:col-span-2"
          />
          <input
            value={form.receiptRef}
            onChange={(e) => setForm({ ...form, receiptRef: e.target.value })}
            placeholder="Where the receipt is filed — not the receipt itself"
            maxLength={120}
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
        <p className="text-xs text-ter">
          Everything lands waiting for approval, including what a treasurer enters — so there is
          always a name and a date against the decision.
        </p>
      </section>

      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Turned down</h2>
          <p className="text-xs text-ter">
            Kept rather than deleted — &ldquo;we said no&rdquo; is a different fact from
            &ldquo;nobody asked&rdquo;, and a refusal in error should not be final.
          </p>
          <ul className="space-y-1 text-xs">
            {rejected.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                <span className="text-sec">{money(row.amount)}</span>
                <span className="text-sec">{row.payee}</span>
                <span className="text-ter">{row.rejectedReason ?? "no reason recorded"}</span>
                <button
                  disabled={busy}
                  onClick={() => send({ action: "reopen", expenseId: row.id })}
                  className="text-ter hover:underline"
                >
                  put it back in the queue
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Categories and budgets</h2>
        <p className="text-xs text-ter">
          A budget is what was set aside for the year. Leaving it empty means nobody has decided,
          which is not the same as nothing being allowed — so a category without one is reported
          without a percentage rather than as instantly over.
        </p>
        <ul className="space-y-1 text-xs">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
              <span className={category.active ? "text-ink" : "text-ter line-through"}>
                {category.name}
              </span>
              <span className="text-sec">
                {category.annualBudget === null ? "no budget set" : money(category.annualBudget)}
              </span>
              <button
                disabled={busy}
                onClick={async () => {
                  const typed = window.prompt(
                    `Budget for ${category.name} in pounds? Leave empty for none.`,
                    category.annualBudget === null ? "" : String(category.annualBudget / 100),
                  );
                  if (typed === null) return;
                  const trimmed = typed.trim();
                  // A typo must not clear the budget: NaN serialises to null,
                  // which would quietly do the opposite of what was asked.
                  if (trimmed !== "" && !Number.isFinite(Number(trimmed))) {
                    return setError(`"${trimmed}" isn't an amount.`);
                  }
                  await send({
                    action: "edit-category",
                    categoryId: category.id,
                    annualBudget: trimmed === "" ? null : Math.round(Number(trimmed) * 100),
                  });
                }}
                className="text-ter hover:underline"
              >
                set budget
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  send({ action: "edit-category", categoryId: category.id, active: !category.active })
                }
                className="text-ter hover:underline"
              >
                {category.active ? "close" : "reopen"}
              </button>
            </li>
          ))}
        </ul>
        {categories.length === 0 && (
          <p className="text-sm text-sec">
            Nothing to record a cost against yet — add the first category below.
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const budget = newCategory.budget.trim();
            const ok = await send({
              action: "category",
              name: newCategory.name,
              slug: slugify(newCategory.name),
              annualBudget: budget === "" ? null : Math.round(Number(budget) * 100),
            });
            if (ok) setNewCategory({ name: "", budget: "" });
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            required
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            placeholder="New category"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={newCategory.budget}
            onChange={(e) => setNewCategory({ ...newCategory, budget: e.target.value })}
            placeholder="Annual budget (optional)"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-sep px-3 py-1.5 text-sm text-ink disabled:opacity-60"
          >
            Add category
          </button>
        </form>
      </section>
    </div>
  );
}
