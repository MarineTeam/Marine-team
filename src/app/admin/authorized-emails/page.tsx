"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  note: string | null;
  addedByEmail: string | null;
  createdAt: string;
};

const MODE_COPY: Record<string, string> = {
  BOTH: "Signing in needs both halves: membership of an approved organization in Auth0, and an active entry here. Adding an address on its own doesn't let a personal account in.",
  ORGANIZATION:
    "This deployment currently authorizes on Auth0 organization membership alone. Entries here are kept but not enforced.",
  ALLOWLIST:
    "This deployment currently authorizes on this list alone. Auth0 organization membership is not being required.",
};

/**
 * The email allowlist, shown as "Who can sign in" — named for the question it
 * answers, so it isn't mistaken for the Members & roles page next to it in the
 * sidebar. Under the default BOTH mode an entry here is only half of what gets
 * someone in (organization membership is the other half), which the copy says
 * rather than letting an administrator assume adding an address is enough.
 */
export default function AuthorizedEmailsAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"BOTH" | "ORGANIZATION" | "ALLOWLIST">("BOTH");
  const [enforced, setEnforced] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/admin/authorized-emails?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
      setMode(data.mode);
      setEnforced(data.enforced);
    } else {
      setError((await res.json()).error ?? "Failed to load the list");
    }
  }, [page, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/authorized-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note: note.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setStatus(`${data.email} can now sign in, once they're a member of an approved organization.`);
      setEmail("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function setRowStatus(row: Row, next: "ACTIVE" | "SUSPENDED") {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/authorized-emails/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setStatus(next === "ACTIVE" ? `${row.email} reinstated.` : `${row.email} suspended.`);
      await load();
    } else {
      setError((await res.json()).error ?? "Failed to update");
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Remove ${row.email}? They lose access on their next request.`)) return;
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/authorized-emails/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setStatus(`${row.email} removed.`);
      await load();
    } else {
      setError((await res.json()).error ?? "Failed to remove");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Who can sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">{MODE_COPY[mode]}</p>
        <p className="mt-2 text-sm text-zinc-500">
          This is the list the app checks on every request. The Grant and Revoke buttons on{" "}
          <a href="/admin/users" className="underline">
            Members &amp; roles
          </a>{" "}
          write here too — that page is about accounts and what they can do, this one is purely
          about who is let in at all.
        </p>
      </div>

      {/* A relaxed mode is a deployment-wide security decision, so it's stated
          on the screen it affects rather than left to whoever remembers the
          environment variable. */}
      {mode !== "BOTH" && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            enforced
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          <strong>AUTHORIZATION_MODE is set to {mode}.</strong>{" "}
          {enforced
            ? "Auth0 organization membership is not being checked."
            : "This list is not being checked — anyone in an approved organization can sign in."}{" "}
          Set it back to BOTH to require both.
        </p>
      )}

      <form onSubmit={add} className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Add an email</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="someone@example.com"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Note (optional)"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Case and spacing don&apos;t matter — addresses are stored lowercase and trimmed.
        </p>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status && !error && <p className="text-sm text-green-600">{status}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search emails…"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-sm text-zinc-500">{total} total</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No authorized emails match.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{row.email}</span>
                  {row.status === "SUSPENDED" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Suspended
                    </span>
                  )}
                </div>
                {row.note && <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">{row.note}</p>}
                <p className="text-xs text-zinc-500">
                  Added {new Date(row.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {row.addedByEmail ? ` by ${row.addedByEmail}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <button
                  onClick={() => setRowStatus(row, row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}
                  className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {row.status === "ACTIVE" ? "Suspend" : "Reinstate"}
                </button>
                <button
                  onClick={() => remove(row)}
                  className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
          >
            Previous
          </button>
          <span className="text-zinc-500">
            Page {page} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
