"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Opening a room for the day. */
export function CheckinSessions({ today, hasSessions }: { today: string; hasSessions: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date: today,
          room: room || null,
          minAge: minAge === "" ? null : Number(minAge),
          maxAge: maxAge === "" ? null : Number(maxAge),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't open that room.");
      setName("");
      setRoom("");
      setMinAge("");
      setMaxAge("");
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't open that room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={open} className="space-y-3 rounded-lg border border-sep p-4">
      <h2 className="text-sm font-semibold text-ink">{hasSessions ? "Open another room" : "Open a room"}</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday 10:30"
          required
          maxLength={120}
          className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
        />
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room (optional)"
          maxLength={120}
          className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-sec">Ages</span>
        <input
          value={minAge}
          onChange={(e) => setMinAge(e.target.value)}
          inputMode="numeric"
          placeholder="from"
          className="w-20 rounded-md border border-sep px-2 py-1.5"
        />
        <input
          value={maxAge}
          onChange={(e) => setMaxAge(e.target.value)}
          inputMode="numeric"
          placeholder="to"
          className="w-20 rounded-md border border-sep px-2 py-1.5"
        />
        <span className="text-xs text-ter">
          Left blank, the room takes any age. A child with no birthday on file is never turned away.
        </span>
      </div>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        Open
      </button>
    </form>
  );
}
