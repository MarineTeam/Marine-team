"use client";

import { useState } from "react";

/**
 * Account deletion, behind a typed confirmation.
 *
 * Deliberately a two-step, type-your-email flow rather than a confirm()
 * dialog: this removes comments, notes, playlists, watch history, and every
 * share link the member created, and none of it comes back. On success the
 * browser goes straight to the Auth0 logout route — the session is what's left
 * pointing at a row that no longer exists.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete account");
      window.location.href = "/auth/logout";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-300 p-4 dark:border-red-900">
      <h3 className="text-sm font-medium text-red-700 dark:text-red-400">Delete account</h3>
      <p className="mt-1 text-xs text-sec">
        Permanently removes your account and everything attached to it — comments, notes, playlists, favorites, watch
        history, and any links you&apos;ve shared. This can&apos;t be undone.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <label htmlFor="confirm-email" className="block text-sm">
            Type <span className="font-medium">{email}</span> to confirm.
          </label>
          <input
            id="confirm-email"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={deleting || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmEmail("");
                setError(null);
              }}
              className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
