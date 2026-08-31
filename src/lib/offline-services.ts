/**
 * Keeping a service's running order on the device.
 *
 * The books could already be saved; the sheet saying which hymns to open
 * could not — which is the wrong way round for a hall with no signal, since
 * the plan is the thing you need first and it is two kilobytes.
 *
 * Its own cache and its own index, like books and videos have theirs (see
 * lib/offline-books.ts): a plan is saved for a particular Sunday and thrown
 * away after it, and clearing one kind of saved thing should never take
 * another with it.
 *
 * Everything here is per device and unauthenticated: the server is never told
 * what has been saved.
 */

export const SERVICE_CACHE = "marine-team-services-v1";
const INDEX_KEY = "marine-offline-services";
export const OFFLINE_SERVICES_CHANGED_EVENT = "marine-offline-services-change";

/** One hymn of a saved plan, as the offline shell needs it. */
export type OfflineServiceItem = {
  title: string;
  /** The number on the board, or the hymn's own printed page; null where neither. */
  number: number | null;
  note: string | null;
  /**
   * Where this hymn is in the app — a book opened at its number, or a hymn's
   * own page. Offline the shell can only follow it as far as what's saved on
   * the device, so it also carries the pieces to work that out.
   */
  href: string | null;
  fileId: string;
  hymnNumber: number | null;
  /** Whether words are stored for it, so the shell knows what it could project. */
  presentable: boolean;
};

export type OfflineService = {
  id: string;
  cacheUrl: string;
  title: string;
  /** ISO date of the service, or null for an undated plan. */
  serviceDate: string | null;
  notes: string | null;
  itemCount: number;
  /** The plan as the server described it when saved — see checkSavedService. */
  version: string | null;
  bytes: number;
  savedAt: string;
};

/** Plans are keyed by id on our own origin, so the service worker finds them by path. */
export function offlineServiceUrl(planId: string): string {
  return `/offline-service/${planId}.json`;
}

export function readOfflineServices(): OfflineService[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineService => Boolean(item?.id && item?.cacheUrl));
  } catch {
    return [];
  }
}

function writeOfflineServices(items: OfflineService[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked; the cached copy itself is still usable this session.
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_SERVICES_CHANGED_EVENT));
}

export function isServiceSaved(planId: string): boolean {
  return readOfflineServices().some((item) => item.id === planId);
}

/** Whether this browser can hold anything at all — Cache Storage needs a secure context. */
export function offlineServicesSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && window.isSecureContext;
}

/**
 * Fetches a plan through the app's own route — so access is checked exactly
 * as it is for reading it — and stores the answer under our cache key.
 *
 * The response is stored as it arrived rather than re-serialised, so what the
 * offline shell reads is byte for byte what the server said.
 */
export async function saveServiceOffline(planId: string): Promise<OfflineService> {
  const response = await fetch(`/api/offline/service/${planId}`, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "You don't have access to this service."
        : "Couldn't fetch this service. Check your connection and try again.",
    );
  }

  const body = await response.text();
  const plan = JSON.parse(body) as {
    id: string;
    title: string;
    serviceDate: string | null;
    notes: string | null;
    fingerprint: string;
    items: OfflineServiceItem[];
  };

  const cacheUrl = offlineServiceUrl(planId);
  const cache = await caches.open(SERVICE_CACHE);
  await cache.put(
    cacheUrl,
    new Response(body, {
      headers: { "Content-Type": "application/json", "Content-Length": String(body.length) },
    }),
  );

  const entry: OfflineService = {
    id: plan.id,
    cacheUrl,
    title: plan.title,
    serviceDate: plan.serviceDate,
    notes: plan.notes,
    itemCount: plan.items.length,
    version: plan.fingerprint,
    bytes: body.length,
    savedAt: new Date().toISOString(),
  };
  writeOfflineServices([entry, ...readOfflineServices().filter((item) => item.id !== planId)]);
  return entry;
}

export async function removeServiceOffline(planId: string): Promise<void> {
  try {
    const cache = await caches.open(SERVICE_CACHE);
    await cache.delete(offlineServiceUrl(planId));
  } catch {
    // The index is what the app and the offline shell read; a cache entry
    // that outlives it is wasted space, not a wrong answer.
  }
  writeOfflineServices(readOfflineServices().filter((item) => item.id !== planId));
}

/**
 * Whether a saved plan still says what the server says.
 *
 * A running order gets reordered right up to Saturday night, so a copy taken
 * on Wednesday is exactly the thing somebody would otherwise stand up and
 * read from without knowing. One small request answers it.
 */
export async function checkSavedService(
  plan: OfflineService,
): Promise<"current" | "outdated" | "unavailable" | "unknown"> {
  try {
    const response = await fetch(`/api/offline/service/${plan.id}?probe=1`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 403 || response.status === 404) return "unavailable";
    if (!response.ok) return "unknown";
    const data = await response.json();
    if (!plan.version || typeof data.fingerprint !== "string") return "unknown";
    return data.fingerprint === plan.version ? "current" : "outdated";
  } catch {
    // Offline, which is not news about the copy either way.
    return "unknown";
  }
}
