"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatIsoDate,
  monthGrid,
  relativeDayLabel,
  todayIso,
} from "@/lib/dates";
import { filterEvents, groupByDay, upcomingEvents } from "@/lib/schedules/logic";
import { scheduleColorClasses } from "@/lib/schedules/colors";
import type { CalendarEvent, Person, Schedule } from "@/lib/schedules/types";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";

type View = "next" | "list" | "month";

/**
 * The calendar, as everybody else sees it.
 *
 * Whoever is looking chooses their name once — on this device, with no
 * account, because most people on a rota have none — and from then on the
 * app can answer "what am I on for" rather than "here is everything". That
 * choice is a device preference like the theme, and grants access to nothing:
 * every schedule here is readable by anyone who has the URL either way.
 */
export function CalendarView({
  schedules,
  events,
  people,
}: {
  schedules: Schedule[];
  events: CalendarEvent[];
  people: Person[];
}) {
  const [view, setView] = useState<View>("next");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));

  // The name is remembered beside the other per-device settings, so it
  // survives a reload and differs between somebody's phone and the church
  // laptop — which is the right answer for both.
  useEffect(() => {
    const stored = readDeviceSettings().calendarPersonId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPersonId(stored);
    if (stored) setOnlyMine(true);
  }, []);

  function chooseName(id: string | null) {
    setPersonId(id);
    setOnlyMine(Boolean(id));
    writeDeviceSettings({ calendarPersonId: id });
  }

  const today = todayIso();
  const shown = useMemo(
    () =>
      filterEvents(events, {
        scheduleIds: scheduleId ? [scheduleId] : undefined,
        personId: onlyMine && personId ? personId : undefined,
      }),
    [events, scheduleId, onlyMine, personId],
  );

  const me = people.find((person) => person.id === personId) ?? null;

  return (
    <div className="space-y-5">
      {/* Who this is, asked once. "Everyone" is a first-class answer — the
          calendar is worth reading without picking anybody. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-sec">You are</span>
          <select
            value={personId ?? ""}
            onChange={(e) => chooseName(e.target.value || null)}
            className="rounded-md border border-sep px-2 py-1.5"
          >
            <option value="">Everyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
        </label>
        {me && (
          <label className="flex items-center gap-1.5 text-sec">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            Only mine
          </label>
        )}
      </div>

      {schedules.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={scheduleId === null} onClick={() => setScheduleId(null)} label="All" />
          {schedules.map((schedule) => (
            <Chip
              key={schedule.id}
              active={scheduleId === schedule.id}
              onClick={() => setScheduleId(schedule.id)}
              label={schedule.name}
              color={schedule.color}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2 text-sm">
        {(["next", "list", "month"] as View[]).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`rounded-md border px-3 py-1.5 ${
              view === option ? "border-accent text-accent" : "border-sep text-sec"
            }`}
          >
            {option === "next" ? "What's next" : option === "list" ? "List" : "Month"}
          </button>
        ))}
      </div>

      {view === "next" && <NextUp events={shown} today={today} schedules={schedules} me={me} />}
      {view === "list" && <DayList events={shown} today={today} schedules={schedules} />}
      {view === "month" && (
        <MonthView
          events={shown}
          month={month}
          onMonth={setMonth}
          today={today}
          schedules={schedules}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const tone = color ? scheduleColorClasses(color) : null;
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
        active ? "border-accent text-accent" : "border-sep text-sec"
      }`}
    >
      {tone && <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${tone.dot}`} />}
      {label}
    </button>
  );
}

/** Today and what is coming — the answer to "am I on for anything". */
function NextUp({
  events,
  today,
  schedules,
  me,
}: {
  events: CalendarEvent[];
  today: string;
  schedules: Schedule[];
  me: Person | null;
}) {
  const coming = upcomingEvents(events, today, { limit: 20, includeToday: true });
  if (coming.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
        {me ? `Nothing coming up for ${me.displayName}.` : "Nothing coming up."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {coming.map((event) => (
        <EventRow key={event.id} event={event} today={today} schedules={schedules} />
      ))}
    </ul>
  );
}

function DayList({
  events,
  today,
  schedules,
}: {
  events: CalendarEvent[];
  today: string;
  schedules: Schedule[];
}) {
  const groups = groupByDay(events);
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
        Nothing on these schedules yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.date} className="space-y-2">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
            {relativeDayLabel(group.date, today) || formatIsoDate(group.date)}
          </h2>
          <ul className="space-y-2">
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} today={today} schedules={schedules} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MonthView({
  events,
  month,
  onMonth,
  today,
  schedules,
}: {
  events: CalendarEvent[];
  month: string;
  onMonth: (value: string) => void;
  today: string;
  schedules: Schedule[];
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = monthGrid(year, monthNumber);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.date);
    if (list) list.push(event);
    else byDay.set(event.date, [event]);
  }

  const shift = (by: number) => {
    const anchor = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
    onMonth(anchor.toISOString().slice(0, 7));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <button onClick={() => shift(-1)} className="rounded-md border border-sep px-2 py-1">
          ‹
        </button>
        <span className="font-medium">
          {new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <button onClick={() => shift(1)} className="rounded-md border border-sep px-2 py-1">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-sep bg-sep text-xs">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, at) => (
          <div key={at} className="bg-panel p-1 text-center text-ter">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const onThisDay = byDay.get(day) ?? [];
          const outside = !day.startsWith(month);
          return (
            <div
              key={day}
              className={`min-h-16 bg-panel p-1 ${outside ? "opacity-40" : ""} ${
                day === today ? "ring-1 ring-inset ring-accent" : ""
              }`}
            >
              <div className="text-ter">{Number(day.slice(8))}</div>
              {onThisDay.slice(0, 3).map((event) => {
                const schedule = schedules.find((s) => s.id === event.scheduleId);
                const tone = schedule ? scheduleColorClasses(schedule.color) : null;
                return (
                  <div key={event.id} className="truncate">
                    {tone && <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />}
                    {event.people.map((person) => person.displayName).join(", ") || schedule?.name}
                  </div>
                );
              })}
              {onThisDay.length > 3 && <div className="text-ter">+{onThisDay.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({
  event,
  today,
  schedules,
}: {
  event: CalendarEvent;
  today: string;
  schedules: Schedule[];
}) {
  const schedule = schedules.find((s) => s.id === event.scheduleId);
  const tone = schedule ? scheduleColorClasses(schedule.color) : null;
  const when = relativeDayLabel(event.date, today) || formatIsoDate(event.date);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-sep p-3">
      {tone && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {event.people.map((person) => person.displayName).join(", ") ||
            event.title ||
            schedule?.name ||
            "Scheduled"}
        </p>
        <p className="text-xs text-sec">
          {[schedule?.name, when, event.startTime, event.location].filter(Boolean).join(" · ")}
        </p>
        {event.notes && <p className="mt-1 text-xs text-ter">{event.notes}</p>}
      </div>
    </li>
  );
}
