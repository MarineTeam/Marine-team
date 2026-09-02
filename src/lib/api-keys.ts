import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Keys for the read API, and what a key is allowed to see.
 *
 * The whole design follows from one sentence: **a key is a password that a
 * machine keeps in a config file.** So it is shown once and never again, only
 * its hash is stored, it carries the smallest set of scopes that does the job,
 * and every scope here is a *read*. There is deliberately no way to write
 * through this API in v1 — a token that can change the diary is a much bigger
 * decision than a token that can read it, and shipping the read half first
 * means nobody has to make both at once.
 */

/**
 * `mt_` so it is recognisable in a log or a leaked file — the thing that makes
 * secret-scanners able to spot one — and `live` so a future test-mode key has
 * somewhere to go without changing what an existing key looks like.
 */
export const KEY_PREFIX = "mt_live_";

/** How much of a key is kept in the clear, so a list of them is legible. */
const VISIBLE = KEY_PREFIX.length + 6;

export type ApiScope =
  | "content:read"
  | "events:read"
  | "events:registrations"
  | "calendar:read"
  | "groups:read"
  | "analytics:read";

/**
 * Every scope, with the sentence an admin reads when ticking the box.
 *
 * Two of these are personal data and say so, because a form that describes
 * "events:read" and "events:registrations" in the same tone is a form that
 * gets both ticked without thinking.
 */
export const API_SCOPES: readonly { scope: ApiScope; label: string; description: string; personal: boolean }[] = [
  {
    scope: "content:read",
    label: "Content",
    description: "Categories, series, videos and files — including drafts and members-only items.",
    personal: false,
  },
  {
    scope: "events:read",
    label: "Events",
    description: "Events and how many places are taken. No names.",
    personal: false,
  },
  {
    scope: "events:registrations",
    label: "Event sign-ups",
    description: "Who has signed up, with the name, email and phone they gave.",
    personal: true,
  },
  {
    scope: "calendar:read",
    label: "Rotas",
    description: "Schedules and their dates, with the names on each — the same as the public rota page.",
    personal: true,
  },
  {
    scope: "groups:read",
    label: "Small groups",
    description: "Groups and their sizes. Never the address, and never who is in one.",
    personal: false,
  },
  {
    scope: "analytics:read",
    label: "Analytics",
    description: "Counts and totals. No individual's history.",
    personal: false,
  },
];

const KNOWN = new Set(API_SCOPES.map((entry) => entry.scope));

export function isApiScope(value: string): value is ApiScope {
  return KNOWN.has(value as ApiScope);
}

/** Drops anything that isn't a scope this app knows, keeping the order given. */
export function cleanScopes(values: readonly string[]): ApiScope[] {
  return [...new Set(values.filter(isApiScope))];
}

/**
 * Whether a key may do the thing being asked.
 *
 * No wildcards and no hierarchy: `events:registrations` does not follow from
 * `events:read`, because the difference between them is a list of names. A
 * scope system where one implies another is one where somebody eventually
 * grants the wrong pair.
 */
export function hasScope(granted: readonly string[], needed: ApiScope): boolean {
  return granted.includes(needed);
}

/** A new key. 32 random bytes, url-safe — guessing is not a strategy. */
export function newApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** SHA-256, hex. What is stored, and what a lookup matches on. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** The part of a key kept in the clear: `mt_live_A1b2C3`. */
export function keyPrefix(key: string): string {
  return key.slice(0, VISIBLE);
}

/** Constant-time comparison, for anywhere two hashes are checked by hand. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // Length is not secret — both are hex SHA-256 — but timingSafeEqual throws on
  // a mismatch, so it has to be checked before rather than inside.
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The key out of an `Authorization` header, or null.
 *
 * Only `Bearer`, and only a value that looks like one of ours. Refusing early
 * on the shape means a stray cookie or a Basic auth header never reaches the
 * database as a lookup, and a caller who sent the wrong kind of credential
 * gets the same answer as one who sent a wrong key.
 */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const key = match[1];
  return key.startsWith(KEY_PREFIX) && key.length > VISIBLE + 8 ? key : null;
}

export type KeyState = "ok" | "revoked" | "expired";

/** Whether a key found in the database may still be used. */
export function keyState(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): KeyState {
  // Revoked beats expired: somebody turned it off on purpose, and that is the
  // more useful thing to be told.
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/** Requests a key may make in a minute. */
export const RATE_LIMIT_PER_MINUTE = 120;

/** How many rows one page may hold, and what it holds when nobody says. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * The page size a caller asked for, clamped.
 *
 * Nonsense resolves to the default rather than to an error: `?limit=all` is
 * somebody guessing at an API, and answering with 25 rows teaches them more
 * than a 400 does.
 */
export function pageSize(raw: string | null): number {
  const asked = Number(raw);
  if (!Number.isInteger(asked) || asked < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(asked, MAX_PAGE_SIZE);
}
