"use client";

import { useCallback, useEffect, useState } from "react";

type Attempt = {
  id: string;
  createdAt: string;
  email: string | null;
  auth0UserId: string | null;
  provider: string | null;
  attemptType: "LOGIN" | "SIGNUP" | "SESSION";
  organizationMember: boolean;
  emailAuthorized: boolean;
  reason: string;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  notifiedAt: string | null;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
};

const REASON_LABELS: Record<string, string> = {
  NOT_ORG_MEMBER: "Not an organization member",
  EMAIL_NOT_AUTHORIZED: "Email not authorized",
  NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED: "Neither check passed",
  AUTH0_CALLBACK_ERROR: "Auth0 refused the login",
};

/**
 * Refused login, signup, and session attempts. Paginated server-side — this
 * table is the one most likely to grow under a scripted attack, so the browser
 * only ever holds one page of it.
 */
export default function AccessAttemptsAdminPage() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [since, setSince] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (email.trim()) params.set("email", email.trim());
    if (reason) params.set("reason", reason);
    if (since) params.set("since", since);

    const res = await fetch(`/api/admin/access-attempts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } else {
      setError((await res.json()).error ?? "Failed to load attempts");
    }
  }, [page, email, reason, since]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markReviewed(attempt: Attempt) {
    const res = await fetch("/api/admin/access-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", id: attempt.id }),
    });
    if (res.ok) await load();
    else setError((await res.json()).error ?? "Failed to update");
  }

  async function prune() {
    if (!confirm("Delete attempts older than 90 days?")) return;
    const res = await fetch("/api/admin/access-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prune", retentionDays: 90 }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus(`Deleted ${data.deleted} old record${data.deleted === 1 ? "" : "s"}.`);
      await load();
    } else {
      setError(data.error ?? "Failed to prune");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Access attempts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Logins, signups, and requests that were refused. Old records are pruned automatically after 90 days; no
          passwords or tokens are ever stored here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          value={email}
          onChange={(e) => {
            setPage(1);
            setEmail(e.target.value);
          }}
          placeholder="Search by email…"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={reason}
          onChange={(e) => {
            setPage(1);
            setReason(e.target.value);
          }}
          aria-label="Filter by reason"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Any reason</option>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={since}
          onChange={(e) => {
            setPage(1);
            setSince(e.target.value);
          }}
          aria-label="Only attempts since"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={prune}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Prune old
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status && !error && <p className="text-sm text-green-600">{status}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing refused — no attempts match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Email</th>
                <th className="p-2">Provider</th>
                <th className="p-2">Type</th>
                <th className="p-2">Org</th>
                <th className="p-2">Allowlist</th>
                <th className="p-2">Reason</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr key={row.id} className={row.reviewedAt ? "text-zinc-400 dark:text-zinc-500" : ""}>
                  <td className="whitespace-nowrap p-2">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="max-w-[14rem] truncate p-2" title={row.userAgent ?? undefined}>
                    {row.email ?? "—"}
                  </td>
                  <td className="p-2">{row.provider ?? "—"}</td>
                  <td className="p-2">{row.attemptType}</td>
                  <td className="p-2">{row.organizationMember ? "✓" : "✗"}</td>
                  <td className="p-2">{row.emailAuthorized ? "✓" : "✗"}</td>
                  <td className="max-w-[16rem] truncate p-2" title={row.detail ?? undefined}>
                    {REASON_LABELS[row.reason] ?? row.reason}
                    {row.detail && <span className="ml-1 text-xs text-zinc-400">({row.detail})</span>}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    {row.reviewedAt ? (
                      <span className="text-xs">Reviewed</span>
                    ) : (
                      <button onClick={() => markReviewed(row)} className="text-xs underline">
                        Mark reviewed
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
        >
          Previous
        </button>
        <span className="text-zinc-500">
          Page {page} of {pageCount} · {total} total
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          disabled={page >= pageCount}
          className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
        >
          Next
        </button>
      </div>
    </div>
  );
}
