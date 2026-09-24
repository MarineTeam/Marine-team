"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type WeekPoint = { week: string; total: number | null; gatherings: number };
type Average = { mean: number; weeksCounted: number; weeksMissing: number } | null;
type Row = {
  date: string;
  gathering: string;
  adults: number | null;
  children: number | null;
  visitors: number | null;
  note: string | null;
};
type View = {
  from: string;
  to: string;
  series: WeekPoint[];
  average: Average;
  trend: string;
  childrenShare: number | null;
  missing: string[];
  chase: string[];
  gatherings: string[];
  recent: Row[];
};

const number = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * The attendance chart and the form that feeds it.
 *
 * Bars rather than a line, and that is the one design decision worth stating:
 * a line through a month nobody counted has to either break or interpolate,
 * and interpolating draws a confident figure for a week that does not exist.
 * A bar chart simply has nothing there — and a dotted baseline tick says
 * "nobody counted" rather than leaving it ambiguous with a genuine nought.
 */
export function AttendanceManager({ canCount }: { canCount: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [weeks, setWeeks] = useState(26);

  const [form, setForm] = useState({
    date: "",
    gathering: "",
    adults: "",
    children: "",
    visitors: "",
    note: "",
  });

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/attendance?weeks=${weeks}`);
    if (!response.ok) return setError("Couldn't load the counts.");
    setView(await response.json());
  }, [weeks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const peak = useMemo(
    () => Math.max(1, ...(view?.series ?? []).map((point) => point.total ?? 0)),
    [view],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          gathering: form.gathering,
          adults: number(form.adults),
          children: number(form.children),
          visitors: number(form.visitors),
          note: form.note || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "That didn't work.");
      // Advisory, not a refusal: the count is already saved. Easter really is
      // three times a normal Sunday.
      if (body.warning) setWarning(body.warning);
      setForm({ ...form, adults: "", children: "", visitors: "", note: "" });
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="text-sm text-sec">Loading…</p>;

  const shown = hover === null ? null : view.series[hover];

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}
      {warning && (
        <p className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-700">
          Saved — but {warning.charAt(0).toLowerCase()}
          {warning.slice(1)}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm text-ink">{view.trend}</p>
            {view.average && (
              <p className="text-xs text-sec">
                Averaged over {view.average.weeksCounted} counted week
                {view.average.weeksCounted === 1 ? "" : "s"}
                {view.average.weeksMissing > 0 && ` · ${view.average.weeksMissing} not counted`}
                {view.childrenShare !== null &&
                  ` · ${Math.round(view.childrenShare * 100)}% children`}
              </p>
            )}
          </div>
          <label className="text-xs text-sec">
            Show
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="ml-1.5 rounded-md border border-sep px-2 py-1 text-sm"
            >
              <option value={13}>13 weeks</option>
              <option value={26}>26 weeks</option>
              <option value={52}>a year</option>
              <option value={104}>two years</option>
            </select>
          </label>
        </div>

        {/* One series, so no legend: the heading names it. */}
        <div className="relative">
          <div
            className="flex h-40 items-end gap-px"
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`Weekly attendance from ${view.from} to ${view.to}`}
          >
            {view.series.map((point, index) => (
              <button
                key={point.week}
                type="button"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                aria-label={
                  point.total === null
                    ? `Week of ${point.week}: nobody counted`
                    : `Week of ${point.week}: ${point.total}`
                }
                className="group relative flex h-full flex-1 items-end"
              >
                {point.total === null ? (
                  // Not a zero-height bar: a zero-height bar is indistinguishable
                  // from a week where nobody came.
                  <span className="block w-full border-t border-dashed border-ter" />
                ) : (
                  <span
                    className="block w-full rounded-t bg-accent transition-opacity group-hover:opacity-70"
                    style={{ height: `${Math.max(2, (point.total / peak) * 100)}%` }}
                  />
                )}
              </button>
            ))}
          </div>

          {shown && (
            <p className="mt-2 text-xs text-sec">
              Week of {shown.week} —{" "}
              {shown.total === null ? (
                <span className="text-ter">nobody counted</span>
              ) : (
                <span className="text-ink">
                  {shown.total} across {shown.gatherings} gathering{shown.gatherings === 1 ? "" : "s"}
                </span>
              )}
            </p>
          )}
          {!shown && <p className="mt-2 text-xs text-ter">Hover a week for its figure.</p>}
        </div>

        {view.chase.length > 0 && (
          <p className="text-xs text-amber-700">
            Not counted yet: {view.chase.slice(0, 6).join(", ")}
            {view.chase.length > 6 && ` and ${view.chase.length - 6} more`}.
          </p>
        )}
      </section>

      {canCount && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Write down a count</h2>
          <form onSubmit={submit} className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-sec">
              Date
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-sec sm:col-span-2">
              Which gathering
              <input
                required
                list="gatherings"
                value={form.gathering}
                onChange={(e) => setForm({ ...form, gathering: e.target.value })}
                placeholder="10:30"
                maxLength={60}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
              <datalist id="gatherings">
                {view.gatherings.map((gathering) => (
                  <option key={gathering} value={gathering} />
                ))}
              </datalist>
            </label>
            <label className="text-xs text-sec">
              Adults
              <input
                type="number"
                min={0}
                value={form.adults}
                onChange={(e) => setForm({ ...form, adults: e.target.value })}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-sec">
              Children
              <input
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => setForm({ ...form, children: e.target.value })}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-sec">
              Of whom visiting
              <input
                type="number"
                min={0}
                value={form.visitors}
                onChange={(e) => setForm({ ...form, visitors: e.target.value })}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-sec sm:col-span-3">
              Anything unusual about the week
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="snow · joint service · funeral"
                maxLength={200}
                className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !form.date || !form.gathering}
              className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-3"
            >
              Save the count
            </button>
          </form>
          <p className="text-xs text-ter">
            Leave a box empty if nobody counted it — empty is kept as unknown, which is not the
            same as nought. Visitors are counted <em>within</em> the adults and children, never
            added on top.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Lately</h2>
        <table className="w-full text-left text-xs">
          <thead className="text-ter">
            <tr>
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 font-normal">Gathering</th>
              <th className="py-1 text-right font-normal">Adults</th>
              <th className="py-1 text-right font-normal">Children</th>
              <th className="py-1 text-right font-normal">Visiting</th>
              <th className="py-1 font-normal">Note</th>
            </tr>
          </thead>
          <tbody>
            {view.recent.map((row) => (
              <tr key={`${row.date}-${row.gathering}`} className="border-t border-sep">
                <td className="py-1 text-ink">{row.date}</td>
                <td className="py-1 text-sec">{row.gathering}</td>
                <td className="py-1 text-right text-sec">{row.adults ?? "—"}</td>
                <td className="py-1 text-right text-sec">{row.children ?? "—"}</td>
                <td className="py-1 text-right text-sec">{row.visitors ?? "—"}</td>
                <td className="py-1 text-ter">{row.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.recent.length === 0 && <p className="text-sm text-sec">Nothing counted yet.</p>}
      </section>
    </div>
  );
}
