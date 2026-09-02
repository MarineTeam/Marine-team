"use client";

import { useEffect, useMemo, useState } from "react";
import { WEEKDAY_CODES, describeRule, parseRule, type WeekdayCode } from "@/lib/recurrence";
import { monthPositionOf, ruleFromChoices, type RepeatShape } from "@/lib/event-series";

/**
 * Setting up something that repeats, without anybody having to type an RRULE.
 *
 * The form is a handful of ordinary controls; the rule is built from them and
 * shown back as a sentence before it is saved. That sentence is the whole point
 * of the preview: "FREQ=MONTHLY;BYDAY=-1SA" is not something a church secretary
 * should have to read to check they picked the right Saturday.
 */

type SeriesRow = {
  id: string;
  title: string;
  describes: string;
  startDate: string;
  published: boolean;
  registration: boolean;
  occurrences: number;
  generatedThrough: string | null;
};

type Ends = "never" | "count" | "until";

const DAY_LABELS: Record<WeekdayCode, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};

export function SeriesManager() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("19:30");
  const [allDay, setAllDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [shape, setShape] = useState<RepeatShape>("WEEKLY");
  const [interval, setInterval] = useState(1);
  const [weekdays, setWeekdays] = useState<WeekdayCode[]>([]);
  const [ends, setEnds] = useState<Ends>("never");
  const [count, setCount] = useState(12);
  const [until, setUntil] = useState("");
  const [registration, setRegistration] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    // The zone the person filling this in is sitting in, which for a church
    // diary is very nearly always the right answer. Read here rather than at
    // render so the server and the first paint agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  async function load() {
    const response = await fetch("/api/admin/events/series");
    if (response.ok) setSeries((await response.json()).series);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const rule = useMemo(
    () =>
      startDate
        ? ruleFromChoices({
            shape,
            interval,
            weekdays,
            startDate,
            ends:
              ends === "count"
                ? { kind: "count", count }
                : ends === "until" && until
                  ? { kind: "until", until }
                  : { kind: "never" },
          })
        : "",
    [shape, interval, weekdays, startDate, ends, count, until],
  );

  const preview = useMemo(() => {
    if (!rule || !startDate) return "";
    try {
      const sentence = describeRule(parseRule(rule), startDate);
      return allDay ? sentence : `${sentence}, ${startTime}`;
    } catch {
      return "";
    }
  }, [rule, startDate, allDay, startTime]);

  async function create(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/events/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          rule,
          timeZone,
          startDate,
          startTime: allDay ? null : startTime,
          durationMinutes: allDay ? null : durationMinutes,
          allDay,
          registration,
          capacity: capacity === "" ? null : Number(capacity),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't set that up.");
      setTitle("");
      setOpen(false);
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't set that up.");
    } finally {
      setBusy(false);
    }
  }

  async function stop(row: SeriesRow) {
    if (
      !confirm(
        `Stop "${row.title}" repeating?\n\nDates still to come that nobody has signed up for are removed. Anything already past, and anything with a sign-up on it, stays as an ordinary event.`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/admin/events/series/${row.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const monthly = monthPositionOf(startDate || "2026-01-01");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Repeating events</h2>
          <p className="text-xs text-sec">
            A rule, kept filled in six months ahead. Each date is an ordinary event with its own sign-up list.
          </p>
        </div>
        <button onClick={() => setOpen((was) => !was)} className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
          {open ? "Cancel" : "Set one up"}
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="space-y-3 rounded-lg border border-sep p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-sec">Title</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Prayer Meeting"
                className="mt-1 rounded-md border border-sep px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sec">First date</span>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 rounded-md border border-sep px-3 py-1.5"
              />
            </label>
            {!allDay && (
              <>
                <label className="text-sm">
                  <span className="block text-sec">Time</span>
                  <input
                    required
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 rounded-md border border-sep px-3 py-1.5"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-sec">Minutes</span>
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="mt-1 w-24 rounded-md border border-sep px-3 py-1.5"
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-sec">Repeats</span>
              <select
                value={shape}
                onChange={(e) => setShape(e.target.value as RepeatShape)}
                className="mt-1 rounded-md border border-sep px-3 py-1.5"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
                <option value="MONTHLY_DAY">Monthly, on the same date</option>
                <option value="MONTHLY_WEEKDAY">
                  Monthly, on the {["", "first", "second", "third", "fourth", "fifth"][monthly.nth]}{" "}
                  {DAY_LABELS[monthly.weekday]}
                </option>
                <option value="MONTHLY_LAST_WEEKDAY">Monthly, on the last {DAY_LABELS[monthly.weekday]}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-sec">Every</span>
              <input
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
                className="mt-1 w-20 rounded-md border border-sep px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sec">Ends</span>
              <select
                value={ends}
                onChange={(e) => setEnds(e.target.value as Ends)}
                className="mt-1 rounded-md border border-sep px-3 py-1.5"
              >
                <option value="never">Never</option>
                <option value="count">After a number of times</option>
                <option value="until">On a date</option>
              </select>
            </label>
            {ends === "count" && (
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-24 rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            )}
            {ends === "until" && (
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="rounded-md border border-sep px-3 py-1.5 text-sm"
              />
            )}
          </div>

          {shape === "WEEKLY" && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-sec">On</span>
              {WEEKDAY_CODES.map((code) => {
                const on = weekdays.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setWeekdays((was) => (on ? was.filter((d) => d !== code) : [...was, code]))}
                    aria-pressed={on}
                    className={`rounded-md border px-2 py-1 text-xs ${on ? "border-transparent btn-primary text-white" : "border-sep hover:bg-hover"}`}
                  >
                    {DAY_LABELS[code]}
                  </button>
                );
              })}
              <span className="ml-2 text-xs text-ter">Leave blank for the day the first date falls on.</span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={registration} onChange={(e) => setRegistration(e.target.checked)} />
              Take sign-ups
            </label>
            {registration && (
              <label className="text-sm">
                <span className="block text-sec">Places each time</span>
                <input
                  type="number"
                  min={0}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="no limit"
                  className="mt-1 w-32 rounded-md border border-sep px-3 py-1.5"
                />
              </label>
            )}
          </div>

          <p className="text-xs text-sec">
            {preview ? (
              <>
                <strong className="text-ink">{preview}</strong> · times are {timeZone}
              </>
            ) : (
              "Pick a first date to see what this comes to."
            )}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !rule}
              className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {busy ? "Setting up…" : "Set up"}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </form>
      )}

      {loaded && series.length > 0 && (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {series.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {row.title}
                  {!row.published && <span className="text-sec"> · draft</span>}
                </p>
                <p className="text-xs text-sec">
                  {row.describes} · {row.occurrences} {row.occurrences === 1 ? "date" : "dates"}
                  {row.generatedThrough && ` · filled in to ${row.generatedThrough}`}
                </p>
              </div>
              <button
                onClick={() => stop(row)}
                className="shrink-0 rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
              >
                Stop repeating
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
