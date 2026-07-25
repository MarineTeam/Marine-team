"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setEntries(data);
        setLoaded(true);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-sm text-zinc-500">The most recent 200 admin/editor actions.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a
            href="/api/admin/audit/export?format=csv"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export CSV
          </a>
          <a
            href="/api/admin/audit/export?format=json"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export JSON
          </a>
        </div>
      </div>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {entries.map((entry) => (
          <li key={entry.id} className="p-4 text-sm">
            <p>
              <span className="font-medium">{entry.actorEmail}</span> {entry.action.replace(/_/g, " ")}{" "}
              {entry.entityType}
              {entry.detail && <span className="text-zinc-500"> — {entry.detail}</span>}
            </p>
            <p className="text-xs text-zinc-400">{new Date(entry.createdAt).toLocaleString()}</p>
          </li>
        ))}
        {loaded && entries.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No activity recorded yet.</li>
        )}
      </ul>
    </div>
  );
}
