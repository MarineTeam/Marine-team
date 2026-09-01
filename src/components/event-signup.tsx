"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationState } from "@/lib/events";

type Mine = { id: string; status: string; guests: number; name: string } | null;

/**
 * The sign-up form, and the answer.
 *
 * Deliberately asks for a name and an email even from somebody signed in: the
 * name on a door list is often not the name on an account ("Liz", not
 * "Elizabeth Okonkwo"), and the address a reminder should go to is often not
 * the one they log in with. Both are prefilled, so agreeing takes no typing.
 */
export function EventSignup({
  slug,
  state,
  maxGuests,
  message,
  mine,
  defaults,
}: {
  slug: string;
  state: RegistrationState;
  maxGuests: number;
  message: string;
  mine: Mine;
  defaults: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(mine?.name ?? defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState(mine?.guests ?? 0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const closed = state !== "open" && state !== "waitlist-only";

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || null, guests, note: note || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't sign you up.");
      setDone(
        body.status === "GOING"
          ? "You're signed up. See you there."
          : "You're on the waiting list — we'll let you know if a place frees up.",
      );
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't sign you up.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel your place?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${slug}/register`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't cancel.");
      setDone(null);
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "off") return null;

  if (mine && !done) {
    return (
      <div className="space-y-2 rounded-lg border border-sep p-4">
        <p className="text-sm font-medium text-ink">
          {mine.status === "GOING" ? "✓ You're signed up." : "You're on the waiting list."}
          {mine.guests > 0 && ` Bringing ${mine.guests}.`}
        </p>
        <button
          onClick={cancel}
          disabled={busy}
          className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-60"
        >
          {busy ? "Cancelling…" : "Cancel my place"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (done) {
    return <p className="rounded-lg border border-sep p-4 text-sm text-ink">{done}</p>;
  }

  if (closed) {
    return <p className="rounded-lg border border-dashed border-sep p-4 text-sm text-sec">{message}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-sep p-4">
      <p className="text-sm font-medium text-ink">
        {state === "waitlist-only" ? "Join the waiting list" : "Sign up"}
      </p>
      {message && <p className="text-xs text-sec">{message}</p>}

      <label className="block text-sm">
        <span className="text-sec">Your name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-sep px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-sec">Email</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-sep px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-sec">Phone (optional)</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-md border border-sep px-3 py-2"
        />
      </label>
      {maxGuests > 0 && (
        <label className="block text-sm">
          <span className="block text-sec">Bringing anyone? (up to {maxGuests})</span>
          <input
            type="number"
            min={0}
            max={maxGuests}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="mt-1 w-24 rounded-md border border-sep px-3 py-2"
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-sec">Anything we should know? (optional)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-sep px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : state === "waitlist-only" ? "Join the waiting list" : "Sign me up"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
