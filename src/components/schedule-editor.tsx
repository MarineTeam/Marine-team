"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent, ProviderValidation, Schedule } from "@/lib/schedules/types";

type Draft = {
  name: string;
  description: string;
  enabled: boolean;
  sourceType: "WEB" | "GOOGLE_SHEETS";
  spreadsheetId: string;
  sheetName: string;
  format: "DATE_NAMES" | "NAME_COLUMNS";
  syncIntervalMinutes: number;
};

/**
 * One schedule: where its events come from, and what is on it.
 *
 * **Test connection** is the important control. A spreadsheet's column
 * mapping is guesswork until you see what the parser made of it, so this
 * shows the first few events exactly as they were read, plus every row it
 * skipped and why — before anything is imported.
 */
export function ScheduleEditor({
  schedule,
  sheetsConfigured,
}: {
  schedule: Schedule & {
    source: {
      spreadsheetId: string | null;
      sheetName: string | null;
      format: string | null;
      syncIntervalMinutes: number;
      lastSyncError: string | null;
    } | null;
  };
  sheetsConfigured: boolean;
}) {
  const [draft, setDraft] = useState<Draft>({
    name: schedule.name,
    description: schedule.description ?? "",
    enabled: schedule.enabled,
    sourceType: schedule.sourceType,
    spreadsheetId: schedule.source?.spreadsheetId ?? "",
    sheetName: schedule.source?.sheetName ?? "",
    format: (schedule.source?.format as Draft["format"]) ?? "DATE_NAMES",
    syncIntervalMinutes: schedule.source?.syncIntervalMinutes ?? 60,
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [validation, setValidation] = useState<ProviderValidation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [date, setDate] = useState("");
  const [names, setNames] = useState("");

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/admin/schedules/${schedule.id}/events`);
    if (res.ok) setEvents((await res.json()).events);
  }, [schedule.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  async function save() {
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description || null,
          enabled: draft.enabled,
          sourceType: draft.sourceType,
          source:
            draft.sourceType === "GOOGLE_SHEETS"
              ? {
                  spreadsheetId: draft.spreadsheetId,
                  sheetName: draft.sheetName,
                  format: draft.format,
                  syncIntervalMinutes: draft.syncIntervalMinutes,
                }
              : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setValidation(null);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}/validate`, { method: "POST" });
      setValidation((await res.json()).validation);
    } finally {
      setBusy(null);
    }
  }

  async function addEvent() {
    if (!date) return;
    setBusy("event");
    setError(null);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          people: names
            .split(/[,;/&+\n]| and /i)
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't add it");
      // Next week, pre-filled: a rota is entered a week at a time and the
      // form staying open is what makes that quick.
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      setDate(next.toISOString().slice(0, 10));
      setNames("");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it");
    } finally {
      setBusy(null);
    }
  }

  async function removeEvent(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/calendar-events/${id}`, { method: "DELETE" });
      await loadEvents();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-medium">Settings</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-sec">Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-sec">Description</span>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Shown on the calendar
        </label>

        <label className="space-y-1 text-xs">
          <span className="text-sec">Events come from</span>
          <select
            value={draft.sourceType}
            onChange={(e) => setDraft({ ...draft, sourceType: e.target.value as Draft["sourceType"] })}
            className="w-full rounded-md border border-sep px-2 py-1.5 text-sm sm:w-64"
          >
            <option value="WEB">This app</option>
            <option value="GOOGLE_SHEETS" disabled={!sheetsConfigured}>
              A Google Sheet
            </option>
          </select>
        </label>

        {/* Switching a schedule's source keeps what was already imported: those
            rows become ordinary editable events, which is the point of the
            provider layer. */}
        {draft.sourceType === "GOOGLE_SHEETS" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-sec">Spreadsheet link or ID</span>
              <input
                value={draft.spreadsheetId}
                onChange={(e) => setDraft({ ...draft, spreadsheetId: e.target.value })}
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Tab name</span>
              <input
                value={draft.sheetName}
                onChange={(e) => setDraft({ ...draft, sheetName: e.target.value })}
                placeholder="Sheet1"
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Layout</span>
              <select
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value as Draft["format"] })}
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
              >
                <option value="DATE_NAMES">Date | Names — one column lists everyone</option>
                <option value="NAME_COLUMNS">Date | Devin | Cindy — a column each, marked ×</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-sec">Sync every (minutes, 0 to stop)</span>
              <input
                type="number"
                value={draft.syncIntervalMinutes}
                onChange={(e) =>
                  setDraft({ ...draft, syncIntervalMinutes: Number(e.target.value) || 0 })
                }
                className="w-full rounded-md border border-sep px-2 py-1.5 text-sm sm:w-32"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={() => void save()}
            disabled={busy === "save"}
            className="rounded-md btn-primary px-3 py-1.5 text-white disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          {draft.sourceType === "GOOGLE_SHEETS" && (
            <button
              onClick={() => void test()}
              disabled={busy === "test"}
              className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
          )}
          {saved && <span className="text-xs text-green-600">Saved</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>

        {schedule.source?.lastSyncError && (
          <p className="text-xs text-red-600">Last sync: {schedule.source.lastSyncError}</p>
        )}

        {/* What the parser made of the sheet, before anything is imported. */}
        {validation && (
          <div className="space-y-2 rounded-md bg-chip p-3 text-xs">
            <p className={validation.ok ? "text-green-600" : "text-red-600"}>{validation.message}</p>
            {validation.preview && (
              <>
                <p className="text-sec">{validation.preview.rowCount} rows read.</p>
                <ul className="space-y-0.5">
                  {validation.preview.sampleEvents.map((event, at) => (
                    <li key={at}>
                      <span className="tabular-nums">{event.date}</span>{" "}
                      <span className="text-sec">{event.peopleNames.join(", ") || "(nobody)"}</span>
                    </li>
                  ))}
                </ul>
                {validation.preview.issues.map((issue, at) => (
                  <p key={at} className="text-amber-600">
                    {issue.row ? `Row ${issue.row}: ` : ""}
                    {issue.message}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-medium">Events</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1 text-xs">
            <span className="block text-sec">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-sep px-2 py-1.5 text-sm"
            />
          </label>
          <label className="min-w-48 flex-1 space-y-1 text-xs">
            <span className="block text-sec">Who&apos;s on (commas, &amp; or “and”)</span>
            <input
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder="Devin, Cindy"
              className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={() => void addEvent()}
            disabled={!date || busy === "event"}
            className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-sec">
          Somebody not on the list yet is created by typing their name. The date moves on a week
          after each one, so a rota can be entered straight down.
        </p>

        {events.length > 0 && (
          <ul className="divide-y divide-sep rounded-md border border-sep text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 p-2.5">
                <span className="min-w-0">
                  <span className="tabular-nums">{event.date}</span>{" "}
                  <span className="text-sec">
                    {event.people.map((person) => person.displayName).join(", ") || "(nobody)"}
                  </span>
                </span>
                <button
                  onClick={() => void removeEvent(event.id)}
                  disabled={busy === event.id}
                  className="shrink-0 text-xs text-sec hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
