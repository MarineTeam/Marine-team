import type { ApiKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  RATE_LIMIT_PER_MINUTE,
  bearerFrom,
  cleanScopes,
  hashApiKey,
  keyPrefix,
  keyState,
  newApiKey,
  type ApiScope,
} from "@/lib/api-keys";

/**
 * Making, listing and checking API keys.
 *
 * The one thing worth reading closely is `authenticate`: it is the front door,
 * and it does its rate limiting in a single UPDATE rather than a read followed
 * by a write. Two requests arriving together on the same key must not both see
 * a count of 99 and both decide they are the hundredth.
 */

export type CreatedKey = { key: string; row: ApiKey };

/**
 * A new key, returned in the clear exactly once.
 *
 * The caller has to hand it straight to whoever asked, because nothing here
 * can produce it again — only its hash is kept.
 */
export async function createApiKey(
  input: { name: string; scopes: readonly string[]; expiresAt?: Date | null },
  createdByEmail: string,
): Promise<CreatedKey> {
  const key = newApiKey();
  const row = await prisma.apiKey.create({
    data: {
      name: input.name.trim(),
      hashedKey: hashApiKey(key),
      prefix: keyPrefix(key),
      scopes: cleanScopes(input.scopes),
      createdByEmail,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { key, row };
}

/** Every key, for the admin list. The hash never leaves this file. */
export async function listApiKeys() {
  const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    state: keyState(row),
  }));
}

/**
 * Turns a key off. The row stays, so the admin list still shows that it
 * existed, who made it and when it was last used — which is the first thing
 * anybody wants after deciding a key has leaked.
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}

export type AuthOutcome =
  | { ok: true; key: ApiKey }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

/**
 * Who is calling, and whether they may.
 *
 * The lookup is by hash, which is also the unique index, so a wrong key costs
 * one indexed miss and tells the caller nothing. Every failure before the rate
 * limit answers 401 with the same shape, deliberately: "no such key",
 * "revoked" and "expired" are distinguished in the message because the caller
 * is the organisation's own developer and guessing at which is a waste of
 * their afternoon — but none of them says whether a *different* key would have
 * worked.
 */
export async function authenticate(authorization: string | null): Promise<AuthOutcome> {
  const presented = bearerFrom(authorization);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      code: "no_key",
      message: "Send your key as `Authorization: Bearer mt_live_…`.",
    };
  }

  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashApiKey(presented) } });
  if (!key) return { ok: false, status: 401, code: "unknown_key", message: "That key isn't recognised." };

  const state = keyState(key);
  if (state === "revoked") {
    return { ok: false, status: 401, code: "revoked", message: "That key has been revoked." };
  }
  if (state === "expired") {
    return { ok: false, status: 401, code: "expired", message: "That key has expired." };
  }

  const { count, secondsLeft } = await countThisRequest(key.id);
  if (count > RATE_LIMIT_PER_MINUTE) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: `That key is over ${RATE_LIMIT_PER_MINUTE} requests a minute.`,
      retryAfter: secondsLeft,
    };
  }

  return { ok: true, key };
}

/**
 * Counts this request against the key's minute, and says how many it has made.
 *
 * One statement, so it is atomic. A read-then-write would let two requests
 * arriving together both see the ninety-ninth count and both decide they were
 * the hundredth — which is not a rounding error on a limit, it is the limit
 * not existing under exactly the load it is there for.
 *
 * Both CASE arms read the *old* `windowStartedAt`, because Postgres evaluates
 * every SET expression against the row as it was before the update. That is
 * what lets one statement both roll the window over and count inside it.
 */
async function countThisRequest(id: string): Promise<{ count: number; secondsLeft: number }> {
  const rows = await prisma.$queryRaw<{ windowCount: number; windowStartedAt: Date }[]>`
    UPDATE "ApiKey"
    SET "windowStartedAt" = CASE
          WHEN "windowStartedAt" < now() - interval '1 minute' THEN now()
          ELSE "windowStartedAt" END,
        "windowCount" = CASE
          WHEN "windowStartedAt" < now() - interval '1 minute' THEN 1
          ELSE "windowCount" + 1 END,
        "lastUsedAt" = now()
    WHERE "id" = ${id}
    RETURNING "windowCount", "windowStartedAt"`;

  const row = rows[0];
  if (!row) return { count: 1, secondsLeft: 60 };
  const elapsed = (Date.now() - row.windowStartedAt.getTime()) / 1000;
  return { count: row.windowCount, secondsLeft: Math.max(1, Math.ceil(60 - elapsed)) };
}

/** Whether a key holds a scope, for a route that has already authenticated. */
export function keyHasScope(key: ApiKey, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}
