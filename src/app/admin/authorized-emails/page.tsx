"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  note: string | null;
  organizationExempt: boolean;
  addedByEmail: string | null;
  createdAt: string;
};

const MODE_COPY: Record<string, string> = {
  BOTH: "Signing in needs both halves: membership of an approved organization in Auth0, and an active entry here. Adding an address on its own doesn't let a personal account in — check \"Guest\" below to invite one specific person without that requirement, while everyone else still needs both.",
  ORGANIZATION:
    "This deployment currently authorizes on Auth0 organization membership alone. Entries here are kept but not enforced.",
  ALLOWLIST:
    "This deployment currently authorizes on this list alone. Auth0 organization membership is not being required.",
  EITHER:
    "This deployment accepts either half on its own: membership of an approved organization in Auth0, or an active entry here. Auth0 offers a choice between a personal account and an organization at login — a personal account gets in on an entry here alone.",
};

/**
 * Banner shown for every mode except BOTH, since a relaxed or reshaped
 * requirement is a deployment-wide security decision worth stating on the
 * screen it affects rather than left to whoever remembers the environment
 * variable. Keyed by mode rather than derived from a single boolean, because
 * EITHER isn't "less enforcement" the way ORGANIZATION/ALLOWLIST are — both
 * checks stay live, just no longer both required of the same person.
 */
const MODE_BANNERS: Partial<Record<string, { tone: "amber" | "red"; text: string }>> = {
  ORGANIZATION: {
    tone: "red",
    text: "This list is not being checked — anyone in an approved organization can sign in. Set it back to BOTH to require both.",
  },
  ALLOWLIST: {
    tone: "amber",
    text: "Auth0 organization membership is not being checked. Set it back to BOTH to require both.",
  },
  EITHER: {
    tone: "amber",
    text: "Either check alone is enough to sign in — this list is being checked, but no longer requires organization membership too. Set it back to BOTH to require both.",
  },
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
  const [mode, setMode] = useState<"BOTH" | "ORGANIZATION" | "ALLOWLIST" | "EITHER">("BOTH");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [guestLoginEnabled, setGuestLoginEnabledState] = useState<boolean | null>(null);
  const [guestLoginBusy, setGuestLoginBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/admin/authorized-emails?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
      setMode(data.mode);
    } else {
      setError((await res.json()).error ?? "Failed to load the list");
    }
  }, [page, search]);

  const loadGuestLogin = useCallback(async () => {
    const res = await fetch("/api/admin/guest-login");
    if (res.ok) setGuestLoginEnabledState((await res.json()).enabled);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadGuestLogin();
  }, [load, loadGuestLogin]);

  async function toggleGuestLogin() {
    if (guestLoginEnabled === null) return;
    setError(null);
    setStatus(null);
    setGuestLoginBusy(true);
    try {
      const next = !guestLoginEnabled;
      const res = await fetch("/api/admin/guest-login", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update");
      setGuestLoginEnabledState(next);
      setStatus(next ? "/auth/guest is open." : "/auth/guest is closed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setGuestLoginBusy(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/authorized-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note: note.trim() || null, organizationExempt: guest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setStatus(
        guest
          ? `${data.email} can now sign in as a guest — no organization membership needed.`
          : `${data.email} can now sign in, once they're a member of an approved organization.`,
      );
      setEmail("");
      setNote("");
      setGuest(false);
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

  async function setRowGuest(row: Row, next: boolean) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/authorized-emails/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationExempt: next }),
    });
    if (res.ok) {
      setStatus(
        next
          ? `${row.email} no longer needs organization membership.`
          : `${row.email} now needs organization membership again, like everyone else.`,
      );
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

      {/* A relaxed or reshaped mode is a deployment-wide security decision, so
          it's stated on the screen it affects rather than left to whoever
          remembers the environment variable. */}
      {MODE_BANNERS[mode] && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            MODE_BANNERS[mode]!.tone === "amber"
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          <strong>AUTHORIZATION_MODE is set to {mode}.</strong> {MODE_BANNERS[mode]!.text}
        </p>
      )}

      {/* The master switch for the guest sign-in path below. Closed by
          default: an alternate login that skips the organization requirement
          is worth having reachable only while an invited guest actually needs
          it, not permanently live on the strength of one exempt row. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-medium">Guest sign-in link</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {guestLoginEnabled
              ? "Open — /auth/guest works. Close it once your guest is done."
              : "Closed — /auth/guest 404s, whether or not any address below is marked Guest."}
          </p>
        </div>
        <button
          onClick={toggleGuestLogin}
          disabled={guestLoginEnabled === null || guestLoginBusy}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
            guestLoginEnabled
              ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {guestLoginEnabled === null ? "…" : guestLoginBusy ? "Working…" : guestLoginEnabled ? "Close it" : "Open it"}
        </button>
      </div>

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
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={guest}
            onChange={(e) => setGuest(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-700"
          />
          Guest — let this address in without organization membership
        </label>
        {/* A guest can't use the normal Log in button: it names the
            organization, so Auth0 turns them away before this list is ever
            consulted. Send them /auth/guest instead. */}
        <p className="text-xs text-zinc-500">
          Send a guest the <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/auth/guest</code>{" "}
          link to sign in — the normal Log in button asks Auth0 for the organization, which turns a
          non-member away before this list is checked. Open it with the switch above first, or it 404s.
        </p>
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
                  {row.organizationExempt && (
                    <span
                      className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                      title="Signs in without organization membership"
                    >
                      Guest
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
                  onClick={() => setRowGuest(row, !row.organizationExempt)}
                  title="Whether this address needs organization membership too"
                  className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {row.organizationExempt ? "Require organization" : "Make guest"}
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
