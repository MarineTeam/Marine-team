"use client";

import { useState } from "react";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  bulkFetch,
  runBulk,
  useBulkSelect,
} from "@/components/bulk-select";

type MissingRow = {
  id: string;
  title: string;
  bunnyPath?: string;
  bunnyVideoId?: string;
  series: { title: string } | null;
  category: { name: string } | null;
};

type AuditResult = {
  storageTruncated: boolean;
  files: MissingRow[];
  videos: MissingRow[];
  checked: { files: number; videos: number };
};

function Section({
  title,
  rows,
  endpoint,
  reference,
  onChanged,
}: {
  title: string;
  rows: MissingRow[];
  /** Per-item admin endpoint; DELETE moves the row to Trash. */
  endpoint: string;
  /** The Bunny identifier to show, so it can be checked in the dashboard. */
  reference: (row: MissingRow) => string;
  onChanged: () => Promise<void>;
}) {
  const bulk = useBulkSelect(rows.map((r) => r.id));
  const [busy, setBusy] = useState(false);

  async function trash(ids: string[], prompt: string) {
    if (!confirm(prompt)) return;
    setBusy(true);
    await runBulk(ids, (id) => bulkFetch(`${endpoint}/${id}`, { method: "DELETE" }));
    bulk.clear();
    setBusy(false);
    await onChanged();
  }

  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
        <p className="mt-2 text-sm text-zinc-500">Nothing missing — every one of these is still in Bunny.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {title} ({rows.length})
        </h2>
        <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={busy} />
      </div>

      <BulkBar count={bulk.count} onClear={bulk.clear} busy={busy}>
        <BulkButton
          danger
          onClick={() =>
            trash(
              bulk.selected,
              `Move ${bulk.count} item${bulk.count === 1 ? "" : "s"} to Trash? Restorable from Admin > Trash.`,
            )
          }
        >
          Move to Trash
        </BulkButton>
      </BulkBar>

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <BulkCheckbox
                checked={bulk.isSelected(row.id)}
                onToggle={(shift) => bulk.toggle(row.id, shift)}
                label={row.title}
              />
              <div className="min-w-0">
                <p className="font-medium">{row.title}</p>
                <p className="truncate text-xs text-zinc-500">
                  {row.series?.title ?? row.category?.name ?? "Unfiled"} ·{" "}
                  <span className="font-mono">{reference(row)}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                trash([row.id], `Move "${row.title}" to Trash? Restorable from Admin > Trash.`)
              }
              className="text-red-600 hover:underline"
            >
              Move to Trash
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MediaCheckPage() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bunny-audit");
      if (!res.ok) throw new Error((await res.json()).error ?? "Check failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Media check</h1>
        <p className="text-sm text-zinc-500">
          Compares every published video and file against Bunny and lists the ones whose underlying media is
          gone — deleted from the Stream library or the storage zone — so the app isn&apos;t advertising
          something it can no longer play or serve. Removing one here moves it to Trash, so it stays
          restorable if the media turns out to have moved rather than gone.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {loading ? "Checking…" : result ? "Check again" : "Run check"}
        </button>
        {result && !loading && (
          <span className="text-sm text-zinc-500">
            Checked {result.checked.videos} video{result.checked.videos === 1 ? "" : "s"} and{" "}
            {result.checked.files} file{result.checked.files === 1 ? "" : "s"}.
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.storageTruncated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The storage zone holds more files than one pass can walk, so absence from it proves nothing and the
          file check was skipped rather than reported as missing. Videos below are still accurate.
        </p>
      )}

      {result && (
        <div className="space-y-6">
          <Section
            title="Videos missing from Bunny Stream"
            rows={result.videos}
            endpoint="/api/admin/videos"
            reference={(row) => row.bunnyVideoId ?? ""}
            onChanged={run}
          />
          {!result.storageTruncated && (
            <Section
              title="Files missing from Bunny Storage"
              rows={result.files}
              endpoint="/api/admin/files"
              reference={(row) => row.bunnyPath ?? ""}
              onChanged={run}
            />
          )}
        </div>
      )}
    </div>
  );
}
