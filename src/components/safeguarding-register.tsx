"use client";

import { useCallback, useEffect, useState } from "react";

type Kind = "BACKGROUND_CHECK" | "REFERENCES" | "TRAINING";

const KINDS: { key: Kind; label: string }[] = [
  { key: "BACKGROUND_CHECK", label: "Criminal-records check" },
  { key: "REFERENCES", label: "References" },
  { key: "TRAINING", label: "Safeguarding training" },
];

type Row = {
  id: string;
  kind: Kind;
  verifiedOn: string;
  expiresOn: string;
  withdrawnAt: string | null;
  reference: string | null;
  verifiedByEmail: string;
};
type Person = { userId: string; name: string; email: string; rows: Row[] };
type Chase = { clearanceId: string; userId: string; name: string; kind: Kind; expiresOn: string; state: string };
type Settings = { checkinDeskRequires: Kind[]; warnDays: number };

const labelFor = (kind: Kind) => KINDS.find((k) => k.key === kind)?.label ?? kind;

/**
 * The safeguarding register.
 *
 * Two things this screen does not do, both on purpose. It has no field for a
 * certificate number — the reference box says what it is for, because a box
 * labelled only "reference" is a box somebody types a disclosure number into.
 * And a withdrawal reason is never rendered in the list: it is fetched for one
 * record, when somebody asks for that record.
 */
export function SafeguardingRegister() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [expiring, setExpiring] = useState<Chase[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    userId: "",
    kind: "BACKGROUND_CHECK" as Kind,
    verifiedOn: "",
    expiresOn: "",
    reference: "",
  });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/safeguarding");
    if (!response.ok) return setError("Couldn't load the register.");
    const body = await response.json();
    setPeople(body.people);
    setExpiring(body.expiring);
    setSettings(body.settings);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/safeguarding", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function withdraw(id: string) {
    const reason = window.prompt("Why is this being withdrawn? It is kept on the record.");
    if (!reason?.trim()) return;
    await send("PATCH", { clearanceId: id, reason });
  }

  async function showReason(id: string) {
    const response = await fetch(`/api/admin/safeguarding?reasonFor=${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const body = await response.json();
    setReasons((current) => ({ ...current, [id]: body.reason ?? "No reason was recorded." }));
  }

  if (!people || !settings) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      {expiring.length > 0 && (
        <section className="space-y-2 rounded-lg border border-amber-300 px-3 py-2">
          <h2 className="text-sm font-semibold text-ink">Running out</h2>
          <ul className="space-y-1 text-sm">
            {expiring.map((chase) => (
              <li key={chase.clearanceId} className="flex justify-between gap-3">
                <span className="text-ink">
                  {chase.name} — {labelFor(chase.kind)}
                </span>
                <span className={chase.state === "expired" ? "text-red-600" : "text-sec"}>
                  {chase.state === "expired" ? "expired" : "expires"} {chase.expiresOn}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ter">
            These are in the follow-up queue too, so somebody&apos;s name is on chasing them.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Who holds what</h2>
        {people.length === 0 && <p className="text-sm text-sec">Nothing recorded yet.</p>}
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.userId} className="space-y-1 rounded-lg border border-sep px-3 py-2 text-sm">
              <p className="text-ink">{person.name}</p>
              <ul className="space-y-1">
                {person.rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <span className="text-sec">{labelFor(row.kind)}</span>
                    {row.withdrawnAt ? (
                      <>
                        <span className="text-red-600">withdrawn</span>
                        {reasons[row.id] ? (
                          <span className="text-ter">— {reasons[row.id]}</span>
                        ) : (
                          <button onClick={() => showReason(row.id)} className="text-accent hover:underline">
                            why?
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-ter">
                          seen {row.verifiedOn} · until {row.expiresOn}
                        </span>
                        {row.reference && <span className="text-ter">· filed at {row.reference}</span>}
                        <button
                          disabled={busy}
                          onClick={() => withdraw(row.id)}
                          className="text-accent hover:underline"
                        >
                          withdraw
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Record that a document was seen</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send("POST", { ...form, reference: form.reference || undefined });
            if (ok) setForm({ ...form, userId: "", verifiedOn: "", expiresOn: "", reference: "" });
          }}
          className="grid gap-2 sm:grid-cols-2"
        >
          <input
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            placeholder="Who (user id)"
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
            className="rounded-md border border-sep px-3 py-1.5 text-sm"
          >
            {KINDS.map((kind) => (
              <option key={kind.key} value={kind.key}>
                {kind.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-sec">
            Seen on
            <input
              type="date"
              value={form.verifiedOn}
              onChange={(e) => setForm({ ...form, verifiedOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-sec">
            Valid until
            <input
              type="date"
              value={form.expiresOn}
              onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-sec sm:col-span-2">
            Where the paper is filed — <strong>not</strong> the certificate number
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="e.g. safeguarding folder 2026/14"
              maxLength={120}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !form.userId || !form.verifiedOn || !form.expiresOn}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 sm:col-span-2"
          >
            Record it
          </button>
        </form>
        <p className="text-xs text-ter">
          Only that somebody saw the document, when, and what it clears them to do until. The
          certificate itself is not kept here and should not be typed in anywhere on this page.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">The check-in desk</h2>
        <p className="text-xs text-sec">
          What somebody must hold to work the desk. Leave everything unticked and the desk is open
          to anybody with the capability — which is where a church starts, before it has entered
          any records.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          {KINDS.map((kind) => (
            <label key={kind.key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={settings.checkinDeskRequires.includes(kind.key)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...settings.checkinDeskRequires, kind.key]
                    : settings.checkinDeskRequires.filter((k) => k !== kind.key);
                  setSettings({ ...settings, checkinDeskRequires: next });
                }}
              />
              {kind.label}
            </label>
          ))}
        </div>
        <label className="block text-xs text-sec">
          Start chasing this many days before an expiry
          <input
            type="number"
            min={7}
            max={365}
            value={settings.warnDays}
            onChange={(e) => setSettings({ ...settings, warnDays: Number(e.target.value) })}
            className="ml-2 w-20 rounded-md border border-sep px-2 py-1 text-sm"
          />
        </label>
        <button
          disabled={busy}
          onClick={() => send("PATCH", settings)}
          className="rounded-md border border-sep px-3 py-1.5 text-sm text-ink"
        >
          Save
        </button>
      </section>
    </div>
  );
}
