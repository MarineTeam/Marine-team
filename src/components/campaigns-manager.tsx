"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadState, Problem } from "@/components/load-state";

type Schedule = "ONE_OFF" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

const SCHEDULES: { key: Schedule; label: string }[] = [
  { key: "ONE_OFF", label: "One gift" },
  { key: "WEEKLY", label: "Weekly" },
  { key: "MONTHLY", label: "Monthly" },
  { key: "QUARTERLY", label: "Quarterly" },
  { key: "ANNUAL", label: "Yearly" },
];

type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  target: number | null;
  startsOn: string;
  endsOn: string | null;
  publicTotals: boolean;
  closed: boolean;
  _count: { pledges: number };
};

type Progress = {
  pledged: number;
  received: number;
  expected: number;
  aheadBy: number;
  fraction: number;
  fulfilled: boolean;
};

type PledgeRow = {
  id: string;
  who: string;
  householdId: string | null;
  amount: number;
  schedule: Schedule;
  startsOn: string;
  endsOn: string | null;
  status: "ACTIVE" | "FULFILLED" | "CANCELLED";
  note: string | null;
  nameMayBeShown: boolean;
  progress: Progress;
};

type View = {
  campaign: { id: string; name: string; slug: string; target: number | null; publicTotals: boolean; closed: boolean };
  summary: {
    target: number | null;
    pledged: number;
    received: number;
    receivedFromPledgers: number;
    outstanding: number;
    pledgeCount: number;
    fractionOfTarget: number | null;
  };
  pledges: PledgeRow[];
  behind: { pledgeId: string; behindBy: number; expected: number; received: number }[];
};

const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );

/**
 * Campaigns and the promises against them.
 *
 * The one design rule this screen exists to obey: **received and promised are
 * never shown as one figure, and received always comes first and larger.** A
 * church that reads £400,000 promised as £400,000 in the bank signs a contract
 * it cannot pay for, and the way that happens is a dashboard with one big
 * number on it.
 */
export function CampaignsManager() {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);

  const [campaignForm, setCampaignForm] = useState({
    name: "",
    slug: "",
    target: "",
    fundId: "",
    startsOn: "",
    endsOn: "",
    publicTotals: false,
  });

  const [pledgeForm, setPledgeForm] = useState({
    householdId: "",
    amount: "",
    schedule: "MONTHLY" as Schedule,
    startsOn: "",
    endsOn: "",
    note: "",
    nameMayBeShown: false,
  });

  const load = useCallback(async () => {
    const [listRes, fundsRes] = await Promise.all([
      fetch("/api/admin/giving/campaigns"),
      fetch("/api/admin/giving/funds"),
    ]);
    if (!listRes.ok) return setError("Couldn't load the campaigns.");
    setCampaigns((await listRes.json()).campaigns);
    if (fundsRes.ok) setFunds((await fundsRes.json()).funds);
  }, []);

  const loadOne = useCallback(async (which: string) => {
    const response = await fetch(`/api/admin/giving/campaigns?slug=${encodeURIComponent(which)}`);
    if (!response.ok) return setError("Couldn't load that campaign.");
    setView(await response.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (slug) void loadOne(slug);
  }, [slug, loadOne]);

  async function send(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/giving/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That didn't work.");
      await load();
      if (slug) await loadOne(slug);
      return true;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!campaigns) return <LoadState error={error} />;

  return (
    <div className="space-y-6">
      {error && <Problem>{error}</Problem>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Campaigns</h2>
        <ul className="space-y-1">
          {campaigns.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => setSlug(row.slug === slug ? null : row.slug)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  row.slug === slug ? "border-accent" : "border-sep"
                }`}
              >
                <span className={row.closed ? "text-ter line-through" : "text-ink"}>{row.name}</span>
                <span className="ml-2 text-xs text-sec">
                  {row.target === null ? "no target" : `${money(row.target)} asked`} ·{" "}
                  {row._count.pledges} pledge{row._count.pledges === 1 ? "" : "s"}
                  {row.publicTotals && " · totals public"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {campaigns.length === 0 && <p className="text-sm text-sec">No campaigns yet.</p>}
      </section>

      {view && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">{view.campaign.name}</h2>

            {/* Received first and largest. Promised is money that has not
                moved, and is deliberately the quieter of the two. */}
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-accent px-3 py-2">
                <p className="text-xs text-sec">Received</p>
                <p className="mt-0.5 text-2xl text-ink">{money(view.summary.received)}</p>
                <p className="mt-0.5 text-xs text-ter">actually in the bank</p>
              </div>
              <div className="rounded-lg border border-sep px-3 py-2">
                <p className="text-xs text-sec">Promised</p>
                <p className="mt-0.5 text-xl text-sec">{money(view.summary.pledged)}</p>
                <p className="mt-0.5 text-xs text-ter">
                  not money · {money(view.summary.outstanding)} still to come
                </p>
              </div>
              <div className="rounded-lg border border-sep px-3 py-2">
                <p className="text-xs text-sec">Asked for</p>
                <p className="mt-0.5 text-xl text-sec">
                  {view.summary.target === null ? "—" : money(view.summary.target)}
                </p>
                {view.summary.fractionOfTarget !== null && (
                  <p className="mt-0.5 text-xs text-ter">
                    {Math.round(view.summary.fractionOfTarget * 100)}% received
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-sec">
              {money(view.summary.receivedFromPledgers)} of the received came from people who
              pledged; the rest came from people who did not.
            </p>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                disabled={busy}
                onClick={() =>
                  send({
                    action: "edit-campaign",
                    campaignId: view.campaign.id,
                    publicTotals: !view.campaign.publicTotals,
                  })
                }
                className="rounded-md border border-sep px-2 py-1 text-ink"
              >
                {view.campaign.publicTotals ? "Stop showing totals publicly" : "Show totals publicly"}
              </button>
              {!view.campaign.closed && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Close this campaign? It will take no new pledges.")) return;
                    await send({ action: "edit-campaign", campaignId: view.campaign.id, closed: true });
                  }}
                  className="rounded-md border border-sep px-2 py-1 text-ter"
                >
                  Close it
                </button>
              )}
            </div>
          </section>

          {view.behind.length > 0 && (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold text-ink">Behind their schedule</h2>
              <p className="text-xs text-ter">
                Arithmetic, not a judgement — somebody three weeks late may have been in hospital.
              </p>
              <ul className="text-xs text-sec">
                {view.behind.slice(0, 8).map((row) => {
                  const pledge = view.pledges.find((p) => p.id === row.pledgeId);
                  return (
                    <li key={row.pledgeId}>
                      {pledge?.who} — {money(row.received)} in, {money(row.expected)} expected by now
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Pledges</h2>
            <ul className="space-y-1 text-xs">
              {view.pledges.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-sep pb-1">
                  <span className={row.status === "CANCELLED" ? "text-ter line-through" : "text-ink"}>
                    {row.who}
                  </span>
                  <span className="text-sec">
                    {money(row.amount)}
                    {row.schedule !== "ONE_OFF" &&
                      ` · ${SCHEDULES.find((s) => s.key === row.schedule)?.label.toLowerCase()}`}
                  </span>
                  <span className="text-ter">
                    {money(row.progress.received)} in ({Math.round(row.progress.fraction * 100)}%)
                    {row.progress.fulfilled && " · kept in full"}
                  </span>
                  {row.note && <span className="text-ter">&ldquo;{row.note}&rdquo;</span>}
                  {row.status === "ACTIVE" && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Cancel ${row.who}'s pledge? The record is kept.`)) return;
                        await send({ action: "cancel-pledge", pledgeId: row.id });
                      }}
                      className="text-ter hover:underline"
                    >
                      cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {view.pledges.length === 0 && <p className="text-sm text-sec">Nobody has pledged yet.</p>}
          </section>

          {!view.campaign.closed && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Record a pledge</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await send({
                    action: "pledge",
                    campaignId: view.campaign.id,
                    householdId: pledgeForm.householdId || null,
                    personId: null,
                    amount: Math.round(Number(pledgeForm.amount) * 100),
                    schedule: pledgeForm.schedule,
                    startsOn: pledgeForm.startsOn,
                    endsOn: pledgeForm.endsOn || null,
                    note: pledgeForm.note || undefined,
                    nameMayBeShown: pledgeForm.nameMayBeShown,
                  });
                  if (ok) setPledgeForm({ ...pledgeForm, householdId: "", amount: "", note: "" });
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                <input
                  required
                  value={pledgeForm.householdId}
                  onChange={(e) => setPledgeForm({ ...pledgeForm, householdId: e.target.value })}
                  placeholder="Household id"
                  className="rounded-md border border-sep px-3 py-1.5 text-sm"
                />
                <input
                  required
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={pledgeForm.amount}
                  onChange={(e) => setPledgeForm({ ...pledgeForm, amount: e.target.value })}
                  placeholder="Whole promise, in pounds"
                  className="rounded-md border border-sep px-3 py-1.5 text-sm"
                />
                <label className="text-xs text-sec">
                  How it arrives
                  <select
                    value={pledgeForm.schedule}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, schedule: e.target.value as Schedule })}
                    className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
                  >
                    {SCHEDULES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-sec">
                  From
                  <input
                    type="date"
                    required
                    value={pledgeForm.startsOn}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, startsOn: e.target.value })}
                    className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
                  />
                </label>
                {pledgeForm.schedule !== "ONE_OFF" && (
                  <label className="text-xs text-sec">
                    Until (leave empty for an open promise)
                    <input
                      type="date"
                      value={pledgeForm.endsOn}
                      onChange={(e) => setPledgeForm({ ...pledgeForm, endsOn: e.target.value })}
                      className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
                    />
                  </label>
                )}
                <input
                  value={pledgeForm.note}
                  onChange={(e) => setPledgeForm({ ...pledgeForm, note: e.target.value })}
                  placeholder="Anything they said about it"
                  maxLength={500}
                  className="rounded-md border border-sep px-3 py-1.5 text-sm sm:col-span-2"
                />
                <label className="flex items-center gap-2 text-xs text-sec sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={pledgeForm.nameMayBeShown}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, nameMayBeShown: e.target.checked })}
                  />
                  They are happy to be named on an internal list
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-2"
                >
                  Record the pledge
                </button>
              </form>
              <p className="text-xs text-ter">
                The whole promise, not the instalment: £50 a month for two years is £1,200. A second
                pledge from the same household replaces the first rather than adding to it.
              </p>
            </section>
          )}
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Start a campaign</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send({
              action: "campaign",
              name: campaignForm.name,
              slug: campaignForm.slug,
              target: campaignForm.target ? Math.round(Number(campaignForm.target) * 100) : null,
              fundId: campaignForm.fundId,
              startsOn: campaignForm.startsOn,
              endsOn: campaignForm.endsOn || null,
              publicTotals: campaignForm.publicTotals,
            });
            if (ok) setCampaignForm({ ...campaignForm, name: "", slug: "", target: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <input
            required
            value={campaignForm.name}
            onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
            placeholder="The roof appeal"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            required
            value={campaignForm.slug}
            onChange={(e) => setCampaignForm({ ...campaignForm, slug: e.target.value })}
            placeholder="roof-appeal"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            min={1}
            step={1}
            value={campaignForm.target}
            onChange={(e) => setCampaignForm({ ...campaignForm, target: e.target.value })}
            placeholder="Target in pounds (optional)"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <label className="text-xs text-sec">
            Which fund it collects into
            <select
              required
              value={campaignForm.fundId}
              onChange={(e) => setCampaignForm({ ...campaignForm, fundId: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-sec">
            From
            <input
              type="date"
              required
              value={campaignForm.startsOn}
              onChange={(e) => setCampaignForm({ ...campaignForm, startsOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-sec">
            Until (optional)
            <input
              type="date"
              value={campaignForm.endsOn}
              onChange={(e) => setCampaignForm({ ...campaignForm, endsOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-2"
          >
            Start it
          </button>
        </form>
        <p className="text-xs text-ter">
          Gifts to the chosen fund inside the campaign&apos;s dates are what count as received —
          including from people who never pledged.
        </p>
      </section>
    </div>
  );
}
