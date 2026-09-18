"use client";

import { useCallback, useEffect, useState } from "react";

type Resource = { id: string; name: string; kind: "ROOM" | "VEHICLE" | "EQUIPMENT"; capacity: number | null; active: boolean };
type Booking = {
  id: string;
  resourceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  resource: { name: string };
  event: { slug: string; title: string } | null;
};

/** The diary for the building. */
export function ResourcesManager() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState({ resourceId: "", title: "", date: "", from: "10:00", to: "12:00" });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/resources");
    if (!response.ok) return setError("Couldn't load the diary.");
    const body = await response.json();
    setResources(body.resources);
    setBookings(body.bookings);
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "That didn't work.");
      await load();
      return payload;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!resources) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Booked</h2>
        {bookings.length === 0 && <p className="text-sm text-sec">Nothing in the next fortnight.</p>}
        <ul className="space-y-1 text-sm">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex items-baseline justify-between gap-3 rounded-md border border-sep px-3 py-2">
              <span>
                <span className="text-ink">{booking.title}</span>
                <span className="text-sec"> · {booking.resource.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 text-xs text-ter">
                {booking.startsAt.slice(0, 10)} {booking.startsAt.slice(11, 16)}–{booking.endsAt.slice(11, 16)}
                <button
                  disabled={busy}
                  onClick={() => send(`/api/admin/resources/bookings?id=${booking.id}`, "DELETE")}
                  className="hover:underline"
                >
                  cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await send("/api/admin/resources/bookings", "POST", {
            resourceId: form.resourceId,
            title: form.title,
            startsAt: new Date(`${form.date}T${form.from}:00Z`).toISOString(),
            endsAt: new Date(`${form.date}T${form.to}:00Z`).toISOString(),
          });
          if (result?.warning) setError(result.warning);
          if (result) setForm({ ...form, title: "" });
        }}
        className="space-y-3 rounded-lg border border-sep p-4"
      >
        <h2 className="text-sm font-semibold text-ink">Book something</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <select
            value={form.resourceId}
            onChange={(e) => setForm({ ...form, resourceId: e.target.value })}
            required
            className="rounded-md border border-sep px-2 py-1.5"
          >
            <option value="">What…</option>
            {resources.filter((r) => r.active).map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
                {resource.capacity === null ? "" : ` (${resource.capacity})`}
              </option>
            ))}
          </select>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What for"
            required
            maxLength={200}
            className="flex-1 rounded-md border border-sep px-3 py-1.5"
          />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className="rounded-md border border-sep px-2 py-1.5" />
          <input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required className="rounded-md border border-sep px-2 py-1.5" />
          <input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required className="rounded-md border border-sep px-2 py-1.5" />
          <button type="submit" disabled={busy} className="btn-primary rounded-md px-3 py-1.5 text-white disabled:opacity-60">
            Book
          </button>
        </div>
        <p className="text-xs text-ter">
          Back-to-back is fine — something ending at 11:00 doesn&apos;t clash with something starting
          at 11:00.
        </p>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Rooms and equipment</h2>
        <ul className="space-y-1 text-sm">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center justify-between rounded-md border border-sep px-3 py-2">
              <span className={resource.active ? "text-ink" : "text-ter"}>
                {resource.name}
                <span className="text-sec">
                  {resource.kind === "ROOM" ? "" : ` · ${resource.kind.toLowerCase()}`}
                  {resource.capacity === null ? "" : ` · holds ${resource.capacity}`}
                </span>
              </span>
              <button
                disabled={busy}
                onClick={() => send(`/api/admin/resources/${resource.id}`, "PATCH", { active: !resource.active })}
                className="text-xs text-ter hover:underline"
              >
                {resource.active ? "Take out of use" : "Back in use"}
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await send("/api/admin/resources", "POST", { name });
            setName("");
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New room, vehicle or piece of kit"
            maxLength={120}
            className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
