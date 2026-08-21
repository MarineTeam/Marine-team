"use client";

import { useState } from "react";

/**
 * The password prompt for a protected share link. On success the API has set
 * the share cookie, so a full navigation (not router.push) is what gets the
 * recipient to content the server will now let them see.
 */
export function ShareUnlockForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/share-links/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't open this link");
      window.location.href = data.path;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open this link");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="share-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="share-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          autoFocus
          required
          className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className="w-full rounded-md btn-primary px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Open link"}
      </button>
    </form>
  );
}
