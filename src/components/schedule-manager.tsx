"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SCHEDULE_COLORS } from "@/lib/schedules/colors";
import type { Schedule } from "@/lib/schedules/types";

type SyncOutcome = {
  status: string;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  issues: { row?: number; message: string }[];
  error?: string | null;
};

/**
 * The rotas this church runs, and where each one's events come from.
 *
 * A schedule is either fed by a Google Sheet somebody already maintains or
 * managed here; the list treats both the same, because everything below the
 * source layer does too.
 */
export function ScheduleManager({ sheetsConfigured }: { sheetsConfigured: boolean }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, SyncOutcome>>({});

  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [sourceType, setSourceType] = useState<"WEB" | "GOOGLE_SHEETS">("WEB");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/schedules");
      if (!res.ok) throw new Error("Couldn't load the schedules");
      setSchedules((await res.json()).schedules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color, sourceType }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't create it");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create it");
    } finally {
      setBusy(null);
    }
  }

  async function sync(schedule: Schedule) {
    setBusy(schedule.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setOutcome((current) => ({ ...current, [schedule.id]: data.result }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-sec">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-medium">New schedule</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-sec">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Breakbread"
              className="rounded-md border border-sep px-2 py-1.5"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-sec">Colour</span>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5"
            >
              {SCHEDULE_COLORS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-sec">Events come from</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as "WEB" | "GOOGLE_SHEETS")}
              className="rounded-md border border-sep px-2 py-1.5"
            >
              <option value="WEB">This app</option>
              <option value="GOOGLE_SHEETS" disabled={!sheetsConfigured}>
                A Google Sheet
              </option>
            </select>
          </label>
          <button
            onClick={() => void create()}
            disabled={!name.trim() || busy === "new"}
            className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
          >
            {busy === "new" ? "Creating…" : "Create"}
          </button>
        </div>
        {/* Said here rather than only when the option is reached for: it is a
            deployment fact, not a mistake somebody made. */}
        {!sheetsConfigured && (
          <p className="text-xs text-sec">
            Google Sheets isn&apos;t configured on this deployment, so every schedule is managed
            here. Set <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and its key to change that.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {schedules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No schedules yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {schedules.map((schedule) => {
            const result = outcome[schedule.id];
            return (
              <li key={schedule.id} className="space-y-2 rounded-lg border border-sep p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{schedule.name}</p>
                    <p className="text-xs text-sec">
                      {schedule.sourceType === "GOOGLE_SHEETS" ? "Google Sheet" : "Managed here"}
                      {!schedule.enabled && " · hidden"}
                      {schedule.lastSyncStatus &&
                        schedule.lastSyncStatus !== "NEVER" &&
                        ` · last sync ${schedule.lastSyncStatus.toLowerCase()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={`/admin/schedules/${schedule.id}`}
                      className="rounded-md border border-sep px-2 py-1"
                    >
                      Events &amp; settings
                    </Link>
                    {schedule.sourceType === "GOOGLE_SHEETS" && (
                      <button
                        onClick={() => void sync(schedule)}
                        disabled={busy === schedule.id}
                        className="rounded-md border border-sep px-2 py-1 disabled:opacity-50"
                      >
                        {busy === schedule.id ? "Syncing…" : "Sync now"}
                      </button>
                    )}
                  </div>
                </div>

                {/* What a sync actually did, including the rows it couldn't
                    read — which is the thing worth seeing, since those are
                    skipped rather than guessed at. */}
                {result && (
                  <div className="rounded-md bg-chip p-2 text-xs text-sec">
                    <p>
                      {result.status.toLowerCase()} · {result.created} added, {result.updated}{" "}
                      updated, {result.deleted} removed, {result.unchanged} unchanged
                    </p>
                    {result.error && <p className="text-red-600">{result.error}</p>}
                    {result.issues.slice(0, 5).map((issue, at) => (
                      <p key={at} className="text-amber-600">
                        {issue.row ? `Row ${issue.row}: ` : ""}
                        {issue.message}
                      </p>
                    ))}
                    {result.issues.length > 5 && <p>…and {result.issues.length - 5} more</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
