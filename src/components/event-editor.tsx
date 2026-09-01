"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Registration = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  guests: number;
  note: string | null;
  status: string;
  userId: string | null;
  createdAt: string;
  promotedAt: string | null;
};

export type EditableEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  published: boolean;
  memberOnly: boolean;
  registration: boolean;
  capacity: number | null;
  waitlist: boolean;
  opensAt: string | null;
  closesAt: string | null;
  maxGuests: number;
};

/** An ISO instant as the `datetime-local` input wants it, in this browser's zone. */
function forInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * One event, and who is coming to it.
 *
 * The two halves are on one screen because they are read together: the reason
 * to open an event a week before it happens is to see the number, and the
 * reason to change the capacity is what the number says.
 */
export function EventEditor({ event: initial }: { event: EditableEvent }) {
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRegistrations = useCallback(async () => {
    const response = await fetch(`/api/admin/events/${initial.id}/registrations`);
    if (response.ok) setRegistrations((await response.json()).registrations);
  }, [initial.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRegistrations();
  }, [loadRegistrations]);

  function set<K extends keyof EditableEvent>(key: K, value: EditableEvent[K]) {
    setEvent((current) => ({ ...current, [key]: value }));
    setSaved(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: event.title,
          slug: event.slug,
          description: event.description,
          location: event.location,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          published: event.published,
          memberOnly: event.memberOnly,
          registration: event.registration,
          capacity: event.capacity,
          waitlist: event.waitlist,
          opensAt: event.opensAt,
          closesAt: event.closesAt,
          maxGuests: event.maxGuests,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save that.");
      // Raising the capacity moves the waiting list, and saying so is the
      // whole reason somebody raised it.
      setSaved(
        body.promoted > 0
          ? `Saved. ${body.promoted} ${body.promoted === 1 ? "person" : "people"} moved off the waiting list.`
          : "Saved.",
      );
      await loadRegistrations();
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(registration: Registration) {
    if (!window.confirm(`Take ${registration.name} off the list?`)) return;
    const response = await fetch(`/api/admin/events/${event.id}/registrations/${registration.id}`, {
      method: "DELETE",
    });
    if (response.ok) await loadRegistrations();
  }

  const going = registrations.filter((r) => r.status === "GOING");
  const waiting = registrations.filter((r) => r.status === "WAITLIST");
  const cancelled = registrations.filter((r) => r.status === "CANCELLED");
  const places = going.reduce((total, r) => total + 1 + r.guests, 0);

  const field = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-sep p-4">
        <label className="block text-sm">
          <span className="text-sec">Title</span>
          <input value={event.title} onChange={(e) => set("title", e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Web address</span>
          <input value={event.slug} onChange={(e) => set("slug", e.target.value)} className={field} />
          <span className="mt-1 block text-xs text-ter">/events/{event.slug}</span>
        </label>
        <label className="block text-sm">
          <span className="text-sec">Description</span>
          <textarea
            rows={4}
            value={event.description ?? ""}
            onChange={(e) => set("description", e.target.value || null)}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Where</span>
          <input
            value={event.location ?? ""}
            onChange={(e) => set("location", e.target.value || null)}
            className={field}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-sec">Starts</span>
            <input
              type="datetime-local"
              value={forInput(event.startsAt)}
              onChange={(e) => set("startsAt", new Date(e.target.value).toISOString())}
              className={field}
            />
          </label>
          <label className="block text-sm">
            <span className="text-sec">Ends (optional)</span>
            <input
              type="datetime-local"
              value={forInput(event.endsAt)}
              onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className={field}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Toggle label="All day" checked={event.allDay} onChange={(v) => set("allDay", v)} />
          <Toggle label="Published" checked={event.published} onChange={(v) => set("published", v)} />
          <Toggle
            label="Members only"
            checked={event.memberOnly}
            onChange={(v) => set("memberOnly", v)}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-sep p-4">
        <Toggle
          label="Take sign-ups"
          checked={event.registration}
          onChange={(v) => set("registration", v)}
        />
        {event.registration && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-sec">Places (blank for no limit)</span>
                <input
                  type="number"
                  min={0}
                  value={event.capacity ?? ""}
                  onChange={(e) => set("capacity", e.target.value === "" ? null : Number(e.target.value))}
                  className={field}
                />
              </label>
              <label className="block text-sm">
                <span className="text-sec">Guests each person may bring</span>
                <input
                  type="number"
                  min={0}
                  value={event.maxGuests}
                  onChange={(e) => set("maxGuests", Number(e.target.value))}
                  className={field}
                />
              </label>
              <label className="block text-sm">
                <span className="text-sec">Sign-up opens (optional)</span>
                <input
                  type="datetime-local"
                  value={forInput(event.opensAt)}
                  onChange={(e) => set("opensAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={field}
                />
              </label>
              <label className="block text-sm">
                <span className="text-sec">Sign-up closes (optional)</span>
                <input
                  type="datetime-local"
                  value={forInput(event.closesAt)}
                  onChange={(e) => set("closesAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={field}
                />
              </label>
            </div>
            <Toggle
              label="Keep a waiting list when it's full"
              checked={event.waitlist}
              onChange={(v) => set("waitlist", v)}
            />
          </>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-700 dark:text-green-400">{saved}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {event.registration && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              Coming: {places} {places === 1 ? "place" : "places"}
              {event.capacity !== null && ` of ${event.capacity}`}
              {waiting.length > 0 && ` · ${waiting.length} waiting`}
            </h2>
            <a
              href={`/api/admin/events/${event.id}/registrations?format=csv`}
              className="text-sm text-accent hover:underline"
            >
              Download as CSV
            </a>
          </div>

          <RegistrationList title="Going" rows={going} onRemove={remove} />
          {waiting.length > 0 && (
            <RegistrationList title="Waiting list" rows={waiting} onRemove={remove} />
          )}
          {cancelled.length > 0 && <RegistrationList title="Cancelled" rows={cancelled} />}
        </section>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function RegistrationList({
  title,
  rows,
  onRemove,
}: {
  title: string;
  rows: Registration[];
  onRemove?: (registration: Registration) => void;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">{title}</h3>
        <p className="rounded-lg border border-dashed border-sep p-4 text-sm text-sec">Nobody yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <h3 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">{title}</h3>
      <ul className="divide-y divide-sep rounded-lg border border-sep">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {row.name}
                {row.guests > 0 && (
                  <span className="text-sec"> +{row.guests}</span>
                )}
                {!row.userId && <span className="ml-2 text-xs text-ter">no account</span>}
                {row.promotedAt && <span className="ml-2 text-xs text-ter">moved up</span>}
              </p>
              <p className="text-xs text-sec">{[row.email, row.phone].filter(Boolean).join(" · ")}</p>
              {row.note && <p className="mt-0.5 text-xs text-ter">{row.note}</p>}
            </div>
            {onRemove && (
              <button
                onClick={() => onRemove(row)}
                className="shrink-0 rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
