import { describe, it, expect } from "vitest";
import {
  API_SCOPES,
  DEFAULT_PAGE_SIZE,
  KEY_PREFIX,
  MAX_PAGE_SIZE,
  bearerFrom,
  cleanScopes,
  hasScope,
  hashApiKey,
  isApiScope,
  keyPrefix,
  keyState,
  newApiKey,
  pageSize,
  sameHash,
} from "./api-keys";

describe("newApiKey", () => {
  it("is recognisable and long", () => {
    const key = newApiKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    // The prefix is what lets a secret scanner spot one in a commit.
    expect(key.length).toBeGreaterThan(40);
  });

  it("is different every time", () => {
    const keys = new Set(Array.from({ length: 200 }, newApiKey));
    expect(keys.size).toBe(200);
  });

  it("is url-safe, so it survives a config file and a curl", () => {
    expect(newApiKey().slice(KEY_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashApiKey", () => {
  it("is stable and one-way", () => {
    const key = newApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).toHaveLength(64);
    expect(hashApiKey(key)).not.toContain(key.slice(KEY_PREFIX.length));
  });

  it("differs for two keys that share a prefix", () => {
    expect(hashApiKey(`${KEY_PREFIX}aaaa`)).not.toBe(hashApiKey(`${KEY_PREFIX}aaab`));
  });
});

describe("keyPrefix", () => {
  it("keeps enough to tell two keys apart and no more", () => {
    const key = `${KEY_PREFIX}A1b2C3d4e5f6`;
    expect(keyPrefix(key)).toBe(`${KEY_PREFIX}A1b2C3`);
    expect(key.startsWith(keyPrefix(key))).toBe(true);
    expect(keyPrefix(key).length).toBeLessThan(key.length);
  });
});

describe("sameHash", () => {
  it("compares equal hashes and rejects different ones", () => {
    const a = hashApiKey("one");
    expect(sameHash(a, hashApiKey("one"))).toBe(true);
    expect(sameHash(a, hashApiKey("two"))).toBe(false);
  });

  it("does not throw on different lengths", () => {
    // timingSafeEqual throws rather than returning false, which is how a
    // constant-time comparison becomes a 500.
    expect(sameHash("abc", "abcdef")).toBe(false);
  });
});

describe("bearerFrom", () => {
  it("reads a well-formed header", () => {
    const key = newApiKey();
    expect(bearerFrom(`Bearer ${key}`)).toBe(key);
    expect(bearerFrom(`bearer ${key}`)).toBe(key);
    expect(bearerFrom(`  Bearer   ${key}  `)).toBe(key);
  });

  it("refuses anything that isn't one of ours before it reaches the database", () => {
    // A stray cookie or a Basic header must never become a lookup.
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom("")).toBeNull();
    expect(bearerFrom("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerFrom("Bearer")).toBeNull();
    expect(bearerFrom("Bearer sk_live_something")).toBeNull();
    expect(bearerFrom(`Bearer ${KEY_PREFIX}short`)).toBeNull();
    expect(bearerFrom(`${newApiKey()}`)).toBeNull();
  });
});

describe("scopes", () => {
  it("knows its own and nothing else", () => {
    expect(isApiScope("content:read")).toBe(true);
    expect(isApiScope("content:write")).toBe(false);
    expect(isApiScope("*")).toBe(false);
  });

  it("drops rubbish and duplicates when a key is made", () => {
    expect(cleanScopes(["content:read", "nonsense", "content:read", "groups:read"])).toEqual([
      "content:read",
      "groups:read",
    ]);
  });

  it("never lets one scope imply another", () => {
    // The difference between these two is a list of names. A hierarchy is how
    // somebody eventually grants the wrong pair.
    expect(hasScope(["events:read"], "events:registrations")).toBe(false);
    expect(hasScope(["events:registrations"], "events:read")).toBe(false);
    expect(hasScope(["events:read"], "events:read")).toBe(true);
  });

  it("is described for every scope, and marks the personal ones", () => {
    for (const entry of API_SCOPES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
    const personal = API_SCOPES.filter((entry) => entry.personal).map((entry) => entry.scope);
    expect(personal).toEqual(["events:registrations", "calendar:read"]);
  });

  it("grants nothing at all by default", () => {
    expect(cleanScopes([])).toEqual([]);
    for (const entry of API_SCOPES) expect(hasScope([], entry.scope)).toBe(false);
  });
});

describe("keyState", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("is ok for a live key", () => {
    expect(keyState({ revokedAt: null, expiresAt: null }, now)).toBe("ok");
    expect(keyState({ revokedAt: null, expiresAt: new Date("2026-07-01") }, now)).toBe("ok");
  });

  it("is expired the moment it expires, not after", () => {
    expect(keyState({ revokedAt: null, expiresAt: now }, now)).toBe("expired");
    expect(keyState({ revokedAt: null, expiresAt: new Date("2026-05-31") }, now)).toBe("expired");
  });

  it("says revoked ahead of expired", () => {
    // Somebody turned it off on purpose, and that is the more useful thing to
    // be told about a key that is both.
    expect(keyState({ revokedAt: new Date("2026-05-01"), expiresAt: new Date("2026-05-02") }, now)).toBe("revoked");
  });
});

describe("pageSize", () => {
  it("clamps to something a database can serve", () => {
    expect(pageSize("10")).toBe(10);
    expect(pageSize("1000")).toBe(MAX_PAGE_SIZE);
  });

  it("answers a guess with the default rather than an error", () => {
    // `?limit=all` is somebody guessing at an API. 25 rows teaches them more
    // than a 400 does.
    expect(pageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize("all")).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize("0")).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize("-5")).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize("2.5")).toBe(DEFAULT_PAGE_SIZE);
  });
});
