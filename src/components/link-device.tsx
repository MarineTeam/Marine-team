"use client";

import { useState } from "react";
import { formatUserCode, normalizeUserCode } from "@/lib/tv-pairing";

type Pending = { deviceName: string; deviceKind: string | null; prompt: string };

/**
 * Typing in the code a television is showing.
 *
 * Two steps rather than one, deliberately. The first looks the code up and
 * says what device it belongs to; only then is there a button that signs it
 * in. The attack this flow cannot design away is somebody being talked into
 * typing a code from a screen that is not theirs, and the defence is a
 * sentence naming what they are about to do - which needs a round trip before
 * it can be written.
 */
export function LinkDevice() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function look(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tv/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't find that code.");
      setPending(body);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't find that code.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tv/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, approve }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't do that.");
      setDone(
        approve
          ? `${body.deviceName} is signed in. It should change in a few seconds.`
          : "Turned down. Nothing was signed in.",
      );
      setPending(null);
      setCode("");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-lg border border-sep p-6">
        <p className="text-sm text-ink">{done}</p>
        <button
          onClick={() => setDone(null)}
          className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
        >
          Link another
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="space-y-4 rounded-lg border border-sep p-6">
        <p className="text-sm text-ink">{pending.prompt}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => answer(true)}
            disabled={busy}
            className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            Yes, sign it in
          </button>
          <button
            onClick={() => answer(false)}
            disabled={busy}
            className="rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover disabled:opacity-60"
          >
            No
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={look} className="space-y-3 rounded-lg border border-sep p-6">
      <label className="block text-sm">
        <span className="text-sec">The code on your television</span>
        <input
          value={formatUserCode(normalizeUserCode(code))}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7P-9QM"
          className="mt-1 w-full rounded-md border border-sep px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase"
        />
      </label>
      <button
        type="submit"
        disabled={busy || normalizeUserCode(code).length < 6}
        className="btn-primary w-full rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {busy ? "Checking..." : "Continue"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
