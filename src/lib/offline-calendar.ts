/**
 * Keeping the calendar on the device.
 *
 * The sibling of lib/offline-books.ts, lib/offline-downloads.ts and
 * lib/offline-services.ts, and the one whose whole payload is a few kilobytes
 * of text — which is why it is the only one that syncs rather than being
 * saved once. `/api/sync/snapshot` was built for exactly this: ask it with a
 * `since` and it answers with what changed and what went away, so a phone
 * that has been in a drawer for a week catches up without re-downloading a
 * year of rotas.
 *
 * Cache Storage rather than IndexedDB, for the same reason as everything else
 * saved here: the service worker can answer for the file directly (see
 * public/sw.js), which is what lets the static offline shell read it with no
 * bundle, no session and no server.
 *
 * Everything here is per device and unauthenticated: the calendar is public
 * to anyone with the URL, and the server is never told what has been saved.
 */

import { compareIsoDates } from "@/lib/dates";
import { sortEvents } from "@/lib/schedules/logic";
import type { CalendarEvent, Person, Schedule, Snapshot } from "@/lib/schedules/types";

export const CALENDAR_CACHE = "marine-team-calendar-v1";
const INDEX_KEY = "marine-offline-calendar";
export const OFFLINE_CALENDAR_CHANGED_EVENT = "marine-offline-calendar-change";

/**
 * There is one calendar, so unlike a book or a service order it needs no id —
 * one path on our own origin, which the service worker recognises by prefix.
 */
export const OFFLINE_CALENDAR_URL = "/offline-calendar/snapshot.json";

/** What is actually stored: the merged calendar, as the shell reads it. */
export type CachedCalendar = {
  schedules: Schedule[];
  people: Person[];
  events: CalendarEvent[];
  /** The server's own timestamp for the last snapshot merged in. */
  syncedAt: string;
  window: { from: string; to: string };
};

/** The index entry, so the app can say what is here without opening the cache. */
export type OfflineCalendar = {
  cacheUrl: string;
  scheduleCount: number;
  eventCount: number;
  personCount: number;
  /** Sent back as `since` on the next sync. */
  syncedAt: string;
  bytes: number;
  savedAt: string;
};

/** Whether this browser can hold anything at all — Cache Storage needs a secure context. */
export function offlineCalendarSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && window.isSecureContext;
}

export function readOfflineCalendar(): OfflineCalendar | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "null");
    return parsed && typeof parsed.syncedAt === "string" ? (parsed as OfflineCalendar) : null;
  } catch {
    return null;
  }
}

function writeOfflineCalendar(entry: OfflineCalendar | null): void {
  try {
    if (entry) window.localStorage.setItem(INDEX_KEY, JSON.stringify(entry));
    else window.localStorage.removeItem(INDEX_KEY);
  } catch {
    // Storage full or blocked; the cached copy itself is still usable this session.
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_CALENDAR_CHANGED_EVENT));
}

function byId<T extends { id: string }>(base: readonly T[], changed: readonly T[], gone: readonly string[]): T[] {
  const rows = new Map(base.map((row) => [row.id, row]));
  for (const row of changed) rows.set(row.id, row);
  // Deletions last: a row that somehow arrived in both lists is one the
  // server is telling us to drop.
  for (const id of gone) rows.delete(id);
  return [...rows.values()];
}

/**
 * Fold a snapshot into what the device already holds.
 *
 * Pure, and the part worth being careful about — an incremental sync is only
 * as good as the merge, and the two things it has to do that nothing tells it
 * to are both here:
 *
 *   - A schedule that was disabled or deleted takes its events with it. The
 *     server can't list them: turning a schedule off doesn't touch a single
 *     event row, so their `updatedAt` never moves and they are never reported
 *     as changed or deleted. Without this they would sit on the device for
 *     good, and somebody would turn up for a rota that had been withdrawn.
 *
 *   - The window slides forward every day. A day that has fallen off the back
 *     of it is not deleted either; it simply stops being sent. Pruning to the
 *     window is what stops the cache growing without limit.
 */
export function mergeSnapshot(base: CachedCalendar | null, delta: Snapshot): CachedCalendar {
  if (delta.full || base === null) {
    return {
      schedules: delta.schedules,
      people: delta.people,
      events: sortEvents(delta.events),
      syncedAt: delta.syncedAt,
      window: delta.window,
    };
  }

  const schedules = byId(base.schedules, delta.schedules, delta.deleted.scheduleIds).sort(
    (a, b) => a.displayOrder - b.displayOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const people = byId(base.people, delta.people, delta.deleted.personIds).sort((a, b) =>
    a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0,
  );

  const live = new Set(schedules.map((schedule) => schedule.id));
  const events = byId(base.events, delta.events, delta.deleted.eventIds).filter(
    (event) =>
      live.has(event.scheduleId) &&
      // A multi-day event counts as inside the window until the day it ends.
      compareIsoDates(event.endDate ?? event.date, delta.window.from) >= 0 &&
      compareIsoDates(event.date, delta.window.to) <= 0,
  );

  return {
    schedules,
    people,
    events: sortEvents(events),
    syncedAt: delta.syncedAt,
    window: delta.window,
  };
}

/** The merged calendar as it stands on this device, or null if there is none. */
export async function loadOfflineCalendar(): Promise<CachedCalendar | null> {
  if (!offlineCalendarSupported()) return null;
  try {
    const cache = await caches.open(CALENDAR_CACHE);
    const stored = await cache.match(OFFLINE_CALENDAR_URL);
    if (!stored) return null;
    const parsed = (await stored.json()) as CachedCalendar;
    return Array.isArray(parsed?.events) ? parsed : null;
  } catch {
    // Evicted under storage pressure, or stored by a version that wrote
    // something else. Either way there is nothing here to merge into.
    return null;
  }
}

/**
 * Bring the saved calendar up to date, saving it for the first time if there
 * is none.
 *
 * Unlike a service order — stored byte for byte as the server sent it — what
 * is written here is the *merge*, so it can't be the server's own bytes. The
 * `syncedAt` it carries is the server's, though, and that is the value the
 * next sync sends back.
 */
export async function syncCalendarOffline(): Promise<OfflineCalendar> {
  const cached = await loadOfflineCalendar();
  // The index can outlive the body it describes. Asking for a delta against a
  // cache we no longer hold would silently produce a calendar with a year
  // missing from it, so a missing body means asking for everything.
  const since = cached?.syncedAt ?? null;

  const response = await fetch(
    since ? `/api/sync/snapshot?since=${encodeURIComponent(since)}` : "/api/sync/snapshot",
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("Couldn't fetch the calendar. Check your connection and try again.");
  }

  const delta = (await response.json()) as Snapshot;
  const merged = mergeSnapshot(cached, delta);
  const body = JSON.stringify(merged);

  const cache = await caches.open(CALENDAR_CACHE);
  await cache.put(
    OFFLINE_CALENDAR_URL,
    new Response(body, {
      headers: { "Content-Type": "application/json", "Content-Length": String(body.length) },
    }),
  );

  const entry: OfflineCalendar = {
    cacheUrl: OFFLINE_CALENDAR_URL,
    scheduleCount: merged.schedules.length,
    eventCount: merged.events.length,
    personCount: merged.people.length,
    syncedAt: merged.syncedAt,
    bytes: body.length,
    savedAt: new Date().toISOString(),
  };
  writeOfflineCalendar(entry);
  return entry;
}

export async function removeCalendarOffline(): Promise<void> {
  try {
    const cache = await caches.open(CALENDAR_CACHE);
    await cache.delete(OFFLINE_CALENDAR_URL);
  } catch {
    // The index is what the app and the offline shell read; a cache entry
    // that outlives it is wasted space, not a wrong answer.
  }
  writeOfflineCalendar(null);
}
